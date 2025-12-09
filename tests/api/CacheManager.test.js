/**
 * Tests for CacheManager.gs
 */

// Mock constants
const CACHE_CONFIG = {
  MAX_MEMORY_CACHE_SIZE: 10,
  TTL_SECONDS: 3600,
};

global.CACHE_CONFIG = CACHE_CONFIG;

// Mock CacheService
const createMockCache = () => {
  const store = {};
  return {
    get: jest.fn((key) => store[key] || null),
    put: jest.fn((key, value, ttl) => {
      store[key] = value;
    }),
    remove: jest.fn((key) => {
      delete store[key];
    }),
    _store: store,
  };
};

const mockCache = createMockCache();
global.CacheService = {
  getDocumentCache: jest.fn(() => mockCache),
};

// Mock console
global.console = {
  warn: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
};

// CacheManager class
class CacheManager {
  constructor() {
    this.cache = {};
    this._cacheSize = 0;
  }

  getCachedResponse(cacheKey) {
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    try {
      const persistentCache = CacheService.getDocumentCache();
      const cached = persistentCache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.cache[cacheKey] = parsed;
        return parsed;
      }
    } catch (parseError) {
      CacheService.getDocumentCache().remove(cacheKey);
    }

    return null;
  }

  storeInCache(cacheKey, response) {
    if (!this.cache[cacheKey]) {
      if (this._cacheSize >= CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE) {
        this._evictOldestCacheEntry();
      }
      this._cacheSize++;
    }
    this.cache[cacheKey] = response;

    try {
      const persistentCache = CacheService.getDocumentCache();
      persistentCache.put(
        cacheKey,
        JSON.stringify(response),
        CACHE_CONFIG.TTL_SECONDS
      );
    } catch (cacheError) {
      console.warn("Failed to cache response:", cacheError);
    }
  }

  _evictOldestCacheEntry() {
    const keys = Object.keys(this.cache);
    if (keys.length > 0) {
      const oldestKey = keys[0];
      delete this.cache[oldestKey];
      this._cacheSize--;
    }
  }

  clearCache() {
    const cacheKeys = Object.keys(this.cache);

    this.cache = {};
    this._cacheSize = 0;

    try {
      const persistentCache = CacheService.getDocumentCache();
      cacheKeys.forEach((key) => {
        persistentCache.remove(key);
      });
      persistentCache.remove("RATE_LIMIT_INFO");
    } catch (error) {
      console.warn("Failed to clear persistent cache:", error);
    }
  }
}

describe("CacheManager", () => {
  let cacheManager;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManager();
    mockCache._store = {};
  });

  describe("constructor", () => {
    test("should initialize with empty cache", () => {
      expect(cacheManager.cache).toEqual({});
      expect(cacheManager._cacheSize).toBe(0);
    });
  });

  describe("getCachedResponse()", () => {
    test("should return null for non-existent key", () => {
      const result = cacheManager.getCachedResponse("nonexistent");

      expect(result).toBeNull();
    });

    test("should return cached value from memory", () => {
      const testData = { data: "test" };
      cacheManager.cache["test-key"] = testData;

      const result = cacheManager.getCachedResponse("test-key");

      expect(result).toEqual(testData);
      expect(CacheService.getDocumentCache).not.toHaveBeenCalled();
    });

    test("should retrieve from persistent cache if not in memory", () => {
      const testData = { data: "persistent" };
      mockCache._store["persistent-key"] = JSON.stringify(testData);
      mockCache.get.mockReturnValue(JSON.stringify(testData));

      const result = cacheManager.getCachedResponse("persistent-key");

      expect(result).toEqual(testData);
      expect(cacheManager.cache["persistent-key"]).toEqual(testData);
    });

    test("should handle invalid JSON in persistent cache", () => {
      mockCache._store["invalid-key"] = "invalid json";
      mockCache.get.mockReturnValue("invalid json");

      const result = cacheManager.getCachedResponse("invalid-key");

      expect(result).toBeNull();
      expect(mockCache.remove).toHaveBeenCalledWith("invalid-key");
    });

    test("should return null if persistent cache get fails", () => {
      mockCache.get.mockImplementation(() => {
        throw new Error("Cache error");
      });

      const result = cacheManager.getCachedResponse("error-key");

      expect(result).toBeNull();
    });
  });

  describe("storeInCache()", () => {
    test("should store in memory cache", () => {
      const testData = { data: "test" };

      cacheManager.storeInCache("test-key", testData);

      expect(cacheManager.cache["test-key"]).toEqual(testData);
      expect(cacheManager._cacheSize).toBe(1);
    });

    test("should store in persistent cache", () => {
      const testData = { data: "test" };

      cacheManager.storeInCache("test-key", testData);

      expect(mockCache.put).toHaveBeenCalledWith(
        "test-key",
        JSON.stringify(testData),
        CACHE_CONFIG.TTL_SECONDS
      );
    });

    test("should not increment size when updating existing key", () => {
      const testData1 = { data: "test1" };
      const testData2 = { data: "test2" };

      cacheManager.storeInCache("test-key", testData1);
      expect(cacheManager._cacheSize).toBe(1);

      cacheManager.storeInCache("test-key", testData2);
      expect(cacheManager._cacheSize).toBe(1);
      expect(cacheManager.cache["test-key"]).toEqual(testData2);
    });

    test("should evict oldest entry when cache is full", () => {
      // Fill cache to max size
      for (let i = 0; i < CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE; i++) {
        cacheManager.storeInCache(`key-${i}`, { data: i });
      }

      expect(cacheManager._cacheSize).toBe(CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE);

      // Add one more - should evict oldest
      cacheManager.storeInCache("new-key", { data: "new" });

      expect(cacheManager._cacheSize).toBe(CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE);
      expect(cacheManager.cache["key-0"]).toBeUndefined();
      expect(cacheManager.cache["new-key"]).toEqual({ data: "new" });
    });

    test("should handle persistent cache errors gracefully", () => {
      mockCache.put.mockImplementation(() => {
        throw new Error("Cache put failed");
      });

      const testData = { data: "test" };

      expect(() =>
        cacheManager.storeInCache("test-key", testData)
      ).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to cache response:",
        expect.any(Error)
      );
      expect(cacheManager.cache["test-key"]).toEqual(testData);
    });
  });

  describe("_evictOldestCacheEntry()", () => {
    test("should evict first key when cache is full", () => {
      cacheManager.cache = {
        "key-1": { data: 1 },
        "key-2": { data: 2 },
        "key-3": { data: 3 },
      };
      cacheManager._cacheSize = 3;

      cacheManager._evictOldestCacheEntry();

      expect(cacheManager.cache["key-1"]).toBeUndefined();
      expect(cacheManager.cache["key-2"]).toEqual({ data: 2 });
      expect(cacheManager.cache["key-3"]).toEqual({ data: 3 });
      expect(cacheManager._cacheSize).toBe(2);
    });

    test("should handle empty cache", () => {
      cacheManager.cache = {};
      cacheManager._cacheSize = 0;

      expect(() => cacheManager._evictOldestCacheEntry()).not.toThrow();
      expect(cacheManager._cacheSize).toBe(0);
    });
  });

  describe("clearCache()", () => {
    test("should clear memory cache", () => {
      cacheManager.cache = {
        "key-1": { data: 1 },
        "key-2": { data: 2 },
      };
      cacheManager._cacheSize = 2;

      cacheManager.clearCache();

      expect(cacheManager.cache).toEqual({});
      expect(cacheManager._cacheSize).toBe(0);
    });

    test("should remove keys from persistent cache", () => {
      cacheManager.cache = {
        "key-1": { data: 1 },
        "key-2": { data: 2 },
      };
      cacheManager._cacheSize = 2;

      cacheManager.clearCache();

      expect(mockCache.remove).toHaveBeenCalledWith("key-1");
      expect(mockCache.remove).toHaveBeenCalledWith("key-2");
      expect(mockCache.remove).toHaveBeenCalledWith("RATE_LIMIT_INFO");
    });

    test("should handle persistent cache errors gracefully", () => {
      cacheManager.cache = { "key-1": { data: 1 } };
      mockCache.remove.mockImplementation(() => {
        throw new Error("Remove failed");
      });

      expect(() => cacheManager.clearCache()).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to clear persistent cache:",
        expect.any(Error)
      );
      expect(cacheManager.cache).toEqual({});
    });

    test("should handle empty cache", () => {
      cacheManager.clearCache();

      expect(cacheManager.cache).toEqual({});
      expect(cacheManager._cacheSize).toBe(0);
    });
  });
});
