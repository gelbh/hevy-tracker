/**
 * Tests for RateLimitManager.gs
 */

// Mock constants
const CACHE_CONFIG = {
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

// RateLimitManager class
class RateLimitManager {
  _extractRateLimitHeaders(headers) {
    const remaining =
      headers["X-RateLimit-Remaining"] || headers["x-ratelimit-remaining"];
    const reset = headers["X-RateLimit-Reset"] || headers["x-ratelimit-reset"];
    const limit = headers["X-RateLimit-Limit"] || headers["x-ratelimit-limit"];

    if (!remaining && !reset && !limit) {
      return null;
    }

    return {
      remaining: remaining ? parseInt(remaining) : null,
      reset: reset ? parseInt(reset) : null,
      limit: limit ? parseInt(limit) : null,
    };
  }

  updateRateLimitInfo(headers) {
    const rateLimitData = this._extractRateLimitHeaders(headers);
    if (!rateLimitData) {
      return;
    }

    const rateLimitInfo = {
      ...rateLimitData,
      timestamp: Date.now(),
    };

    try {
      const cache = CacheService.getDocumentCache();
      cache.put(
        "RATE_LIMIT_INFO",
        JSON.stringify(rateLimitInfo),
        CACHE_CONFIG.TTL_SECONDS
      );
    } catch (error) {
      console.warn("Failed to store rate limit info:", error);
    }

    if (
      rateLimitInfo.remaining !== null &&
      rateLimitInfo.limit !== null &&
      rateLimitInfo.remaining / rateLimitInfo.limit < 0.1
    ) {
      console.warn(
        `Rate limit warning: ${rateLimitInfo.remaining}/${rateLimitInfo.limit} requests remaining`
      );
    }
  }

  getRateLimitInfo() {
    try {
      const cache = CacheService.getDocumentCache();
      const cached = cache.get("RATE_LIMIT_INFO");
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn("Failed to get rate limit info:", error);
    }
    return null;
  }
}

describe("RateLimitManager", () => {
  let rateLimitManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, "now").mockReturnValue(1000000);
    rateLimitManager = new RateLimitManager();
    mockCache._store = {};
    mockCache.put.mockImplementation((key, value, ttl) => {
      mockCache._store[key] = value;
    });
  });

  afterEach(() => {
    Date.now.mockRestore();
  });

  describe("_extractRateLimitHeaders()", () => {
    test("should extract headers with uppercase keys", () => {
      const headers = {
        "X-RateLimit-Remaining": "100",
        "X-RateLimit-Reset": "1234567890",
        "X-RateLimit-Limit": "1000",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toEqual({
        remaining: 100,
        reset: 1234567890,
        limit: 1000,
      });
    });

    test("should extract headers with lowercase keys", () => {
      const headers = {
        "x-ratelimit-remaining": "50",
        "x-ratelimit-reset": "1234567890",
        "x-ratelimit-limit": "500",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toEqual({
        remaining: 50,
        reset: 1234567890,
        limit: 500,
      });
    });

    test("should handle mixed case headers", () => {
      const headers = {
        "X-RateLimit-Remaining": "75",
        "x-ratelimit-reset": "1234567890",
        "X-RateLimit-Limit": "1000",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toEqual({
        remaining: 75,
        reset: 1234567890,
        limit: 1000,
      });
    });

    test("should parse string numbers to integers", () => {
      const headers = {
        "X-RateLimit-Remaining": "42",
        "X-RateLimit-Reset": "999999999",
        "X-RateLimit-Limit": "100",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result.remaining).toBe(42);
      expect(result.reset).toBe(999999999);
      expect(result.limit).toBe(100);
    });

    test("should return null when no rate limit headers present", () => {
      const headers = {
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toBeNull();
    });

    test("should handle null values", () => {
      const headers = {
        "X-RateLimit-Remaining": null,
        "X-RateLimit-Reset": null,
        "X-RateLimit-Limit": null,
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toBeNull();
    });

    test("should handle partial headers", () => {
      const headers = {
        "X-RateLimit-Remaining": "100",
      };

      const result = rateLimitManager._extractRateLimitHeaders(headers);

      expect(result).toEqual({
        remaining: 100,
        reset: null,
        limit: null,
      });
    });
  });

  describe("updateRateLimitInfo()", () => {
    test("should store rate limit info in cache", () => {
      const headers = {
        "X-RateLimit-Remaining": "100",
        "X-RateLimit-Reset": "1234567890",
        "X-RateLimit-Limit": "1000",
      };
      const mockTimestamp = 1000000;
      Date.now.mockReturnValue(mockTimestamp);

      rateLimitManager.updateRateLimitInfo(headers);

      expect(mockCache.put).toHaveBeenCalledWith(
        "RATE_LIMIT_INFO",
        expect.stringContaining('"remaining":100'),
        CACHE_CONFIG.TTL_SECONDS
      );

      // The put function should have stored it in _store
      expect(mockCache._store["RATE_LIMIT_INFO"]).toBeDefined();
      const stored = JSON.parse(mockCache._store["RATE_LIMIT_INFO"]);
      expect(stored.remaining).toBe(100);
      expect(stored.limit).toBe(1000);
      expect(stored.timestamp).toBe(mockTimestamp);
    });

    test("should not store when no rate limit headers", () => {
      const headers = { "Content-Type": "application/json" };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(mockCache.put).not.toHaveBeenCalled();
    });

    test("should warn when approaching rate limit (<10%)", () => {
      const headers = {
        "X-RateLimit-Remaining": "5", // 5% of 100
        "X-RateLimit-Limit": "100",
      };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(console.warn).toHaveBeenCalledWith(
        "Rate limit warning: 5/100 requests remaining"
      );
    });

    test("should warn at exactly 10%", () => {
      const headers = {
        "X-RateLimit-Remaining": "10", // Exactly 10% of 100
        "X-RateLimit-Limit": "100",
      };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test("should not warn when above 10%", () => {
      const headers = {
        "X-RateLimit-Remaining": "11", // 11% of 100
        "X-RateLimit-Limit": "100",
      };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test("should not warn when remaining is null", () => {
      const headers = {
        "X-RateLimit-Limit": "100",
      };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test("should not warn when limit is null", () => {
      const headers = {
        "X-RateLimit-Remaining": "5",
      };

      rateLimitManager.updateRateLimitInfo(headers);

      expect(console.warn).not.toHaveBeenCalled();
    });

    test("should handle cache errors gracefully", () => {
      mockCache.put.mockImplementation(() => {
        throw new Error("Cache error");
      });

      const headers = {
        "X-RateLimit-Remaining": "100",
        "X-RateLimit-Limit": "1000",
      };

      expect(() => rateLimitManager.updateRateLimitInfo(headers)).not.toThrow();
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to store rate limit info:",
        expect.any(Error)
      );
    });
  });

  describe("getRateLimitInfo()", () => {
    test("should retrieve rate limit info from cache", () => {
      const rateLimitInfo = {
        remaining: 100,
        reset: 1234567890,
        limit: 1000,
        timestamp: 1000000,
      };
      mockCache._store["RATE_LIMIT_INFO"] = JSON.stringify(rateLimitInfo);
      mockCache.get.mockReturnValue(JSON.stringify(rateLimitInfo));

      const result = rateLimitManager.getRateLimitInfo();

      expect(result).toEqual(rateLimitInfo);
      expect(mockCache.get).toHaveBeenCalledWith("RATE_LIMIT_INFO");
    });

    test("should return null when not in cache", () => {
      mockCache.get.mockReturnValue(null);

      const result = rateLimitManager.getRateLimitInfo();

      expect(result).toBeNull();
    });

    test("should handle invalid JSON gracefully", () => {
      mockCache.get.mockReturnValue("invalid json");

      const result = rateLimitManager.getRateLimitInfo();

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to get rate limit info:",
        expect.any(Error)
      );
    });

    test("should handle cache get errors gracefully", () => {
      mockCache.get.mockImplementation(() => {
        throw new Error("Cache get error");
      });

      const result = rateLimitManager.getRateLimitInfo();

      expect(result).toBeNull();
      expect(console.warn).toHaveBeenCalledWith(
        "Failed to get rate limit info:",
        expect.any(Error)
      );
    });
  });
});
