/**
 * Manages rate limit tracking and warnings from API responses.
 * @class RateLimitManager
 */
class RateLimitManager {
  /**
   * Extracts rate limit headers from response (case-insensitive)
   * @param {Object<string, string>} headers - Response headers
   * @returns {Object} Rate limit values or null
   * @private
   */
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

  /**
   * Updates rate limit information from API response headers
   * @param {Object<string, string>} headers - Response headers
   */
  updateRateLimitInfo(headers) {
    const rateLimitData = this._extractRateLimitHeaders(headers);
    if (!rateLimitData) {
      return;
    }

    const rateLimitInfo = {
      ...rateLimitData,
      timestamp: Date.now(),
    };

    // Store in persistent cache
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

    // Warn if approaching rate limit (less than 10% remaining)
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

  /**
   * Gets current rate limit information from cache
   * @returns {Object|null} Rate limit info or null if not available
   */
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
