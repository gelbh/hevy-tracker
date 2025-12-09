/**
 * Manages caching of API responses with LRU eviction.
 * @class CacheManager
 */
class CacheManager {
  constructor() {
    this.cache = {};
    this._cacheSize = 0;
  }

  /**
   * Gets cached response for GET requests
   * @param {string} cacheKey - Cache key for the request
   * @returns {Object|null} Cached response or null if not found
   */
  getCachedResponse(cacheKey) {
    // Check in-memory cache first
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    // Check persistent cache
    try {
      const persistentCache = CacheService.getDocumentCache();
      const cached = persistentCache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.cache[cacheKey] = parsed;
        return parsed;
      }
    } catch (parseError) {
      // Remove invalid cache entry
      CacheService.getDocumentCache().remove(cacheKey);
    }

    return null;
  }

  /**
   * Stores response in cache (memory and persistent)
   * @param {string} cacheKey - Cache key
   * @param {Object} response - Response to cache
   */
  storeInCache(cacheKey, response) {
    // Store in memory cache with LRU eviction
    if (!this.cache[cacheKey]) {
      if (this._cacheSize >= CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE) {
        this._evictOldestCacheEntry();
      }
      this._cacheSize++;
    }
    this.cache[cacheKey] = response;

    // Store in persistent cache
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

  /**
   * Evicts the oldest cache entry when cache size limit is reached
   * Uses simple FIFO eviction (first key in cache object)
   * @private
   */
  _evictOldestCacheEntry() {
    const keys = Object.keys(this.cache);
    if (keys.length > 0) {
      const oldestKey = keys[0];
      delete this.cache[oldestKey];
      this._cacheSize--;
    }
  }

  /**
   * Clears all caches (memory and persistent)
   * Useful for testing or when cache needs to be invalidated
   * Note: CacheService doesn't provide a way to enumerate all keys,
   * so we can only clear keys that are currently in memory cache.
   */
  clearCache() {
    // Store cache keys before clearing in-memory cache
    const cacheKeys = Object.keys(this.cache);

    // Clear in-memory cache
    this.cache = {};
    this._cacheSize = 0;

    // Remove known cache keys from persistent cache
    try {
      const persistentCache = CacheService.getDocumentCache();
      cacheKeys.forEach((key) => {
        persistentCache.remove(key);
      });
      // Also remove rate limit info if it exists
      persistentCache.remove("RATE_LIMIT_INFO");
    } catch (error) {
      console.warn("Failed to clear persistent cache:", error);
    }
  }
}
