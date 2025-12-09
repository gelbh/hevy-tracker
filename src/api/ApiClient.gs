/**
 * @typedef {Object} ApiRequestOptions
 * @property {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @property {Object<string, string>} headers - HTTP headers
 * @property {string} [payload] - Request payload for POST/PUT requests
 * @property {boolean} muteHttpExceptions - Whether to mute HTTP exceptions
 * @property {boolean} validateHttpsCertificates - Whether to validate HTTPS certificates
 * @property {boolean} followRedirects - Whether to follow redirects
 * @property {number} timeout - Request timeout in milliseconds
 */

/**
 * @typedef {Object} ApiResponse
 * @property {*} [workout] - Workout data (if applicable)
 * @property {*} [workouts] - Array of workouts (if applicable)
 * @property {*} [routines] - Array of routines (if applicable)
 * @property {*} [exercises] - Array of exercises (if applicable)
 * @property {*} [events] - Array of events (if applicable)
 * @property {number} [page_count] - Total number of pages (for paginated responses)
 * @property {number} [workout_count] - Total workout count (for count endpoint)
 */

/**
 * Enhanced API utility functions with better type handling and resilience.
 * @class ApiClient
 */
class ApiClient {
  constructor() {
    const config = this._getApiClientConfig();
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: config.BASE_DELAY_MS,
      maxDelay: config.MAX_DELAY_MS,
    };

    // Initialize managers
    this.circuitBreaker = new CircuitBreaker(config);
    this.cacheManager = new CacheManager();
    this.rateLimitManager = new RateLimitManager();
    this.apiKeyManager = new ApiKeyManager(this);
    this.importManager = new ImportManager(this, this.apiKeyManager);
  }

  /**
   * Gets API client configuration with fallback defaults
   * Handles cases where API_CLIENT_CONFIG may not be loaded yet due to file load order
   * @returns {Object} API client configuration object
   * @private
   */
  _getApiClientConfig() {
    // Use fallback defaults if constant is not yet loaded
    if (typeof API_CLIENT_CONFIG !== "undefined") {
      return API_CLIENT_CONFIG;
    }

    // Fallback defaults matching Constants.gs values
    return {
      BASE_DELAY_MS: 1000,
      MAX_DELAY_MS: 10000,
      VALIDATION_TIMEOUT_MS: 15000,
      REQUEST_TIMEOUT_MS: 30000,
      CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5,
      CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 60000,
    };
  }

  // API Key Management - Delegated to ApiKeyManager

  /**
   * Gets API key from document properties
   * @returns {string|null} API key or null if not found
   * @private
   */
  _getApiKeyFromProperties() {
    return this.apiKeyManager.getApiKeyFromProperties();
  }

  /**
   * Gets API key or prompts user to set one if not found
   * @returns {string|null} API key or null if not available
   * @private
   */
  getOrPromptApiKey() {
    return this.apiKeyManager.getOrPromptApiKey();
  }

  /**
   * Shows the API key management dialog
   */
  manageApiKey() {
    return this.apiKeyManager.manageApiKey();
  }

  /**
   * Saves the API key and initiates initial data import if needed
   * @param {string} apiKey - The API key to save
   * @throws {ValidationError} If API key format is invalid
   */
  saveUserApiKey(apiKey) {
    return this.apiKeyManager.saveUserApiKey(apiKey);
  }

  /**
   * Handles invalid API key error
   * @param {InvalidApiKeyError} error - The invalid API key error
   * @private
   */
  _handleInvalidApiKey(error) {
    return this.apiKeyManager.handleInvalidApiKey(error);
  }

  /**
   * Shows a prompt to set or reset the API key
   * @private
   */
  promptForApiKey(message) {
    return this.apiKeyManager.promptForApiKey(message);
  }

  /**
   * Confirms with user about resetting API key
   * @private
   */
  confirmKeyReset() {
    return this.apiKeyManager.confirmKeyReset();
  }

  /**
   * Validates the API key by making a test request
   * @param {string} apiKey - The API key to validate
   * @returns {Promise<boolean>} True if valid
   * @throws {InvalidApiKeyError} If API key is invalid
   * @throws {Error} If request times out or fails
   * @private
   */
  async validateApiKey(apiKey) {
    return this.apiKeyManager.validateApiKey(apiKey);
  }

  // Import Management - Delegated to ImportManager

  /**
   * Makes a paginated API request with automatic page handling
   * @param {string} endpoint - API endpoint to fetch from
   * @param {number} pageSize - Number of items per page
   * @param {Function} processFn - Async function to process each page of data
   * @param {string} dataKey - Key in API response containing the data array
   * @param {Object} [additionalParams={}] - Additional query parameters
   * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
   * @returns {Promise<number>} Total number of items processed across all pages
   * @throws {ApiError} If API request fails
   * @throws {ImportTimeoutError} If timeout is detected
   */
  async fetchPaginatedData(
    endpoint,
    pageSize,
    processFn,
    dataKey,
    additionalParams = {},
    checkTimeout = null
  ) {
    return this.importManager.fetchPaginatedData(
      endpoint,
      pageSize,
      processFn,
      dataKey,
      additionalParams,
      checkTimeout
    );
  }

  /**
   * Runs initial data import sequence for new API key setup
   * @param {string} [apiKeyOverride=null] - Optional API key to use instead of reading from properties
   * @param {boolean} [skipResumeDialog=false] - If true, skip the resume dialog and start fresh automatically
   */
  async runFullImport(apiKeyOverride = null, skipResumeDialog = false) {
    return this.importManager.runFullImport(apiKeyOverride, skipResumeDialog);
  }

  // Core Request Methods

  /**
   * Serializes payload for request
   * @param {*} payload - Request payload
   * @returns {string} Serialized payload
   * @private
   */
  _serializePayload(payload) {
    if (typeof payload === "string") return payload;
    if (payload?.body) return payload.body;
    return JSON.stringify(payload ?? {});
  }

  /**
   * Determines if an error should trigger a retry
   * @param {Error} error - The error to check
   * @param {number} attempt - Current attempt number (0-indexed)
   * @returns {boolean} True if should retry
   * @private
   */
  _shouldRetry(error, attempt) {
    return (
      error instanceof ApiError &&
      error.isRetryable() &&
      attempt < this.retryConfig.maxRetries - 1
    );
  }

  /**
   * Checks if error message indicates network/timeout issues
   * @param {Error} error - The error to check
   * @returns {boolean} True if network/timeout error
   * @private
   */
  _isNetworkError(error) {
    const message = error?.message?.toLowerCase() ?? "";
    const networkKeywords = ["timeout", "dns error", "network"];
    return networkKeywords.some((keyword) => message.includes(keyword));
  }

  /**
   * Makes an API request with error handling and retries
   * @param {string} endpoint - The API endpoint to request
   * @param {Object} options - Request options
   * @param {Object} [queryParams={}] - Query parameters
   * @param {*} [payload=null] - Request payload for POST/PUT requests
   * @returns {Promise<Object>} Parsed response data
   * @throws {ApiError} If request fails after retries
   */
  async makeRequest(endpoint, options, queryParams = {}, payload = null) {
    this.circuitBreaker.check(endpoint);

    const cacheKey = this.getCacheKey(endpoint, queryParams);
    const isGetRequest = options.method === "GET";

    // Check cache for GET requests
    if (isGetRequest) {
      const cached = this.cacheManager.getCachedResponse(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Build request URL and add payload if needed
    const url = this.buildUrl(endpoint, queryParams);
    if (payload) {
      options.payload = this._serializePayload(payload);
    }

    // Retry loop
    let lastError;
    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(url, options);
        const parsedResponse = this.handleResponse(response);

        this.circuitBreaker.recordSuccess();

        // Cache successful GET responses
        if (isGetRequest) {
          this.cacheManager.storeInCache(cacheKey, parsedResponse);
        }

        return parsedResponse;
      } catch (error) {
        lastError = error;

        // Record failure if not retrying or on final attempt
        const shouldRetry = this._shouldRetry(error, attempt);
        if (!shouldRetry || attempt === this.retryConfig.maxRetries - 1) {
          this.circuitBreaker.recordFailure(error);
        }

        if (!shouldRetry) {
          throw ErrorHandler.handle(error, {
            endpoint,
            queryParams,
            attempt: attempt + 1,
            operation: "API request",
          });
        }

        const delay = this.calculateBackoff(attempt);
        Utilities.sleep(delay);
      }
    }

    throw ErrorHandler.handle(lastError, {
      endpoint,
      queryParams,
      attempt: this.retryConfig.maxRetries,
      operation: "API request max retries exceeded",
    });
  }

  /**
   * Creates standardized request options for API calls
   * @param {string} apiKey - API key for authentication
   * @param {string} [method='get'] - HTTP method to use (GET, POST, PUT, DELETE)
   * @param {Object} [additionalHeaders={}] - Additional HTTP headers to include
   * @returns {ApiRequestOptions} Request options object for UrlFetchApp
   */
  createRequestOptions(apiKey, method = "get", additionalHeaders = {}) {
    const config = this._getApiClientConfig();
    return {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
        ...additionalHeaders,
      },
      muteHttpExceptions: true,
      validateHttpsCertificates: true,
      followRedirects: true,
      timeout: config.REQUEST_TIMEOUT_MS,
    };
  }

  /**
   * Executes an HTTP request using UrlFetchApp
   * Wrapped in Promise for proper async/await support
   * @param {string} url - The URL to request
   * @param {Object} options - Request options
   * @returns {Promise<GoogleAppsScript.URL_Fetch.HTTPResponse>} Response object
   */
  async executeRequest(url, options) {
    try {
      // Track quota usage
      QuotaTracker.recordUrlFetch(1);

      return UrlFetchApp.fetch(url, options);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Executing HTTP request",
        url: url,
      });
    }
  }

  /**
   * Calculates exponential backoff time with jitter
   * @param {number} attempt - Current retry attempt number
   * @returns {number} Delay in milliseconds before next retry
   */
  calculateBackoff(attempt) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );

    return delay * (0.5 + Math.random() * 0.5);
  }

  /**
   * HTTP status code to error message mapping
   * @param {number} statusCode - HTTP status code
   * @returns {string|null} Error message or null
   */
  static getStatusErrorMessage(statusCode) {
    const messages = {
      [HTTP_STATUS.BAD_REQUEST]: "Invalid request parameters",
      [HTTP_STATUS.UNAUTHORIZED]: "Invalid API key",
      [HTTP_STATUS.FORBIDDEN]: "Access forbidden",
      [HTTP_STATUS.NOT_FOUND]: "Resource not found",
      [HTTP_STATUS.TOO_MANY_REQUESTS]: "Rate limit exceeded",
    };
    return messages[statusCode] || null;
  }

  /**
   * Handles API response parsing and error checking
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - Response from UrlFetchApp
   * @returns {Object|null} Parsed response data or null for NO_CONTENT
   * @throws {ApiError} If response indicates an error
   */
  handleResponse(response) {
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    const headers = response.getHeaders();

    this.rateLimitManager.updateRateLimitInfo(headers);

    if (statusCode === HTTP_STATUS.NO_CONTENT) {
      return null;
    }

    // Handle successful responses
    if (
      statusCode >= HTTP_STATUS_RANGE.SUCCESS_START &&
      statusCode <= HTTP_STATUS_RANGE.SUCCESS_END
    ) {
      try {
        return JSON.parse(responseText);
      } catch (error) {
        throw ErrorHandler.handle(
          new ApiError(
            "Invalid JSON response from API",
            statusCode,
            responseText
          ),
          { operation: "Parsing API response" }
        );
      }
    }

    // Handle error responses
    const errorMessage =
      ApiClient.getStatusErrorMessage(statusCode) ||
      `API request failed with status ${statusCode}`;

    throw ErrorHandler.handle(
      new ApiError(errorMessage, statusCode, responseText),
      { operation: "API response error" }
    );
  }

  /**
   * Builds a complete URL with query parameters
   * @param {string} endpoint - API endpoint
   * @param {Object} queryParams - Query parameters to append
   * @returns {string} Complete URL with query parameters
   */
  buildUrl(endpoint, queryParams) {
    const baseUrl = `${API_ENDPOINTS.BASE}${endpoint}`;
    return Object.keys(queryParams).length === 0
      ? baseUrl
      : `${baseUrl}?${this.buildQueryString(queryParams)}`;
  }

  /**
   * Converts an object of query parameters into a URL-encoded string
   * @param {Object} params - Query parameters object
   * @returns {string} URL-encoded query string
   */
  buildQueryString(params) {
    return Object.entries(params)
      .filter(([, value]) => value != null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");
  }

  /**
   * Generates a consistent cache key string for GET requests.
   * @param {string} endpoint - API endpoint
   * @param {Object} queryParams - Query parameters
   * @returns {string} Cache key
   */
  getCacheKey(endpoint, queryParams) {
    return `${endpoint}?${this.buildQueryString(queryParams)}`;
  }

  /**
   * Gets current rate limit information from cache
   * @returns {Object|null} Rate limit info or null if not available
   */
  getRateLimitInfo() {
    return this.rateLimitManager.getRateLimitInfo();
  }

  /**
   * Clears all caches (memory and persistent)
   * Useful for testing or when cache needs to be invalidated
   */
  clearCache() {
    return this.cacheManager.clearCache();
  }
}

// Lazy singleton instance - created on first access
let _apiClientInstance = null;

/**
 * Gets the singleton ApiClient instance (lazy initialization)
 * This ensures all dependencies are loaded before ApiClient is instantiated
 * @returns {ApiClient} The singleton ApiClient instance
 */
function getApiClient() {
  if (!_apiClientInstance) {
    _apiClientInstance = new ApiClient();
  }
  return _apiClientInstance;
}
