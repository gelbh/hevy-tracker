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
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: API_CLIENT_CONFIG.BASE_DELAY_MS,
      maxDelay: API_CLIENT_CONFIG.MAX_DELAY_MS,
    };
    this.cache = {};
    this._cacheSize = 0; // Track cache size for LRU eviction
    this._apiKeyCheckInProgress = false;
    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: "CLOSED", // CLOSED, OPEN, HALF_OPEN
      failureThreshold: API_CLIENT_CONFIG.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      resetTimeout: API_CLIENT_CONFIG.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    };
  }

  /**
   * Gets document properties or throws ConfigurationError
   * @returns {GoogleAppsScript.Properties.Properties} Document properties
   * @throws {ConfigurationError} If properties cannot be accessed
   * @private
   */
  _getDocumentProperties() {
    const properties = getDocumentProperties();
    if (!properties) {
      throw new ConfigurationError(
        "Unable to access document properties. Please ensure you have proper permissions."
      );
    }
    return properties;
  }

  /**
   * Gets API key from document properties
   * @returns {string|null} API key or null if not found
   * @private
   */
  _getApiKeyFromProperties() {
    const properties = getDocumentProperties();
    return properties?.getProperty("HEVY_API_KEY") || null;
  }

  /**
   * Gets API key or prompts user to set one if not found
   * @returns {string|null} API key or null if not available
   * @private
   */
  getOrPromptApiKey() {
    const key = this._getApiKeyFromProperties();
    if (key) {
      return key;
    }

    if (!this._apiKeyCheckInProgress) {
      this.promptForApiKey(
        "An API key is required. Would you like to set it now?"
      );
    }
    return null;
  }

  /**
   * Shows the API key management dialog
   */
  manageApiKey() {
    try {
      const currentKey = this._getApiKeyFromProperties();
      if (currentKey && !this.confirmKeyReset()) {
        this._apiKeyCheckInProgress = false;
        return;
      }

      this._showApiKeyDialog();
    } catch (error) {
      this._apiKeyCheckInProgress = false;
      throw ErrorHandler.handle(error, "Managing API key");
    }
  }

  /**
   * Shows the API key setup dialog
   * @private
   */
  _showApiKeyDialog() {
    showHtmlDialog("src/ui/dialogs/SetApiKey", {
      width: DIALOG_DIMENSIONS.API_KEY_WIDTH,
      height: DIALOG_DIMENSIONS.API_KEY_HEIGHT,
      title: "Hevy API Key Setup",
    });
  }

  /**
   * Saves the API key and initiates initial data import if needed
   * @param {string} apiKey - The API key to save
   * @throws {Error} Serialized error for HTML service compatibility
   */
  async saveUserApiKey(apiKey) {
    try {
      await this.validateApiKey(apiKey);
      const properties = this._getDocumentProperties();
      const currentKey = properties.getProperty("HEVY_API_KEY");

      properties.setProperty("HEVY_API_KEY", apiKey);
      properties.deleteProperty("LAST_WORKOUT_UPDATE");
      this._apiKeyCheckInProgress = false;

      if (!currentKey) {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "API key set successfully. Starting initial data import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
        // Pass API key directly to avoid property read timing issues
        // Fire-and-forget: start import in background, don't wait for it
        this.runFullImport(apiKey).catch((error) => {
          // Errors are already logged by ErrorHandler
          console.error("Background import failed:", error);
        });
      } else {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "API key updated successfully!",
          "Success",
          TOAST_DURATION.NORMAL
        );
      }
    } catch (error) {
      this._apiKeyCheckInProgress = false;

      // Handle invalid API key with user-friendly message
      if (error instanceof InvalidApiKeyError) {
        // Create a serializable error for HTML service
        const serializedError = new Error(
          "Invalid API key. Please check your Hevy Developer Settings and reset your API key."
        );
        serializedError.name = "InvalidApiKeyError";
        throw serializedError;
      }

      // Handle other errors - ensure they're serializable
      const handledError = ErrorHandler.handle(
        error,
        {
          operation: "Saving API key",
        },
        false
      ); // Don't show toast here, let HTML dialog handle it

      // Convert to plain Error for HTML service
      const serializedError = new Error(handledError.message);
      serializedError.name = handledError.name || "Error";
      throw serializedError;
    }
  }

  /**
   * Handles invalid API key error
   * @param {InvalidApiKeyError} error - The invalid API key error
   * @private
   */
  _handleInvalidApiKey(error) {
    const properties = getDocumentProperties();
    properties?.deleteProperty("HEVY_API_KEY");

    SpreadsheetApp.getUi().alert(
      "Invalid API Key",
      "The provided API key appears to be invalid or revoked. Please check your Hevy Developer Settings and try again.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    this.promptForApiKey("Would you like to set a new API key?");
  }

  /**
   * Makes a paginated API request with automatic page handling
   * Fetches all pages of data and processes them incrementally
   *
   * @param {string} endpoint - API endpoint to fetch from
   * @param {number} pageSize - Number of items per page
   * @param {Function} processFn - Async function to process each page of data
   * @param {string} dataKey - Key in API response containing the data array
   * @param {Object} [additionalParams={}] - Additional query parameters
   * @returns {Promise<number>} Total number of items processed across all pages
   * @throws {ApiError} If API request fails
   * @example
   * await apiClient.fetchPaginatedData(
   *   API_ENDPOINTS.WORKOUTS,
   *   PAGE_SIZE.WORKOUTS,
   *   async (workouts) => { /* process workouts *\/ },
   *   "workouts"
   * );
   */
  async fetchPaginatedData(
    endpoint,
    pageSize,
    processFn,
    dataKey,
    additionalParams = {}
  ) {
    const apiKey = this.getOrPromptApiKey();
    if (!apiKey) return 0;

    let page = 1;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.fetchPage(
          endpoint,
          apiKey,
          page,
          pageSize,
          additionalParams
        );
        const result = await this.processPageData(
          response,
          dataKey,
          processFn,
          pageSize,
          page
        );

        totalProcessed += result.processedCount;
        hasMore = result.hasMore;

        if (hasMore) {
          page++;
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.statusCode === HTTP_STATUS.NOT_FOUND
        ) {
          break;
        }
        throw ErrorHandler.handle(error, {
          endpoint,
          page,
          operation: "Fetching paginated data",
        });
      }
    }

    return totalProcessed;
  }

  // Private helper methods

  /**
   * Shows a prompt to set or reset the API key
   * @private
   */
  promptForApiKey(message) {
    if (this._apiKeyCheckInProgress) {
      return;
    }

    this._apiKeyCheckInProgress = true;
    const ui = SpreadsheetApp.getUi();
    if (
      ui.alert("Hevy API Key Required", message, ui.ButtonSet.YES_NO) ===
      ui.Button.YES
    ) {
      this.manageApiKey();
    } else {
      this._apiKeyCheckInProgress = false;
    }
  }

  /**
   * Confirms with user about resetting API key
   * @private
   */
  confirmKeyReset() {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      "Hevy API Key Management",
      "A Hevy API key is already set. Would you like to reset it?",
      ui.ButtonSet.YES_NO
    );
    return response === ui.Button.YES;
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
    const url = `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`;
    // Use shorter timeout for validation since it's just a quick check
    const options = {
      ...this.createRequestOptions(apiKey),
      timeout: API_CLIENT_CONFIG.VALIDATION_TIMEOUT_MS,
    };

    try {
      const response = await this.executeRequest(url, options);

      if (response.getResponseCode() === HTTP_STATUS.UNAUTHORIZED) {
        throw ErrorHandler.handle(
          new InvalidApiKeyError("Invalid or revoked API key"),
          { operation: "Validating API key" },
          false // Don't show toast during validation
        );
      }

      return true;
    } catch (error) {
      // Handle timeout and network errors
      if (
        error.message &&
        (error.message.includes("timeout") ||
          error.message.includes("Timeout") ||
          error.message.includes("DNS error") ||
          error.message.includes("network"))
      ) {
        throw new Error(
          "Request timed out. Please check your internet connection and try again."
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Ensures the automatic import trigger exists
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The spreadsheet
   * @private
   */
  _ensureImportTrigger(ss) {
    const triggers = ScriptApp.getUserTriggers(ss);
    const exists = triggers.some(
      (t) =>
        t.getHandlerFunction() === "runAutomaticImport" &&
        t.getEventType() === ScriptApp.EventType.ON_OPEN
    );

    if (!exists) {
      ScriptApp.newTrigger("runAutomaticImport")
        .forSpreadsheet(ss)
        .onOpen()
        .create();
    }
  }

  /**
   * Sets up weight import formula for authorized API key
   * @private
   */
  _setupAuthorizedWeightImport() {
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(WEIGHT_SHEET_NAME)
      .getRange("A2")
      .setFormula(
        'IF(TRUE, ARRAYFORMULA(IMPORTRANGE("1vKDObz3ZHoeEBZsyUCpb85AUX3Sc_4V2OmNSyxPEd68", "Weight History!A2:B") * {1, WEIGHT_CONVERSION_FACTOR(Main!$I$5)}), "")'
      );
  }

  /**
   * Runs initial data import sequence for new API key setup
   * @param {string} [apiKeyOverride=null] - Optional API key to use instead of reading from properties
   */
  async runFullImport(apiKeyOverride = null) {
    const startTime = Date.now();

    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      this._ensureImportTrigger(ss);

      if (checkForMultiLoginIssues()) {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "Multi-login warning shown. Continuing with import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
      }

      // Use provided API key or get from properties
      const apiKey = apiKeyOverride || this._getApiKeyFromProperties();
      if (!apiKey) {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "API key not found. Please set it using Extensions > Hevy Tracker > Set API Key",
          "API Key Required",
          TOAST_DURATION.NORMAL
        );
        return;
      }

      if (apiKey === AUTHORIZED_API_KEY) {
        this._setupAuthorizedWeightImport();
      }

      await importAllExercises();

      const isTemplate = ss.getId() === TEMPLATE_SPREADSHEET_ID;
      if (!isTemplate) {
        await importAllRoutineFolders();
        Utilities.sleep(RATE_LIMIT.API_DELAY);
        await importAllRoutines();
        Utilities.sleep(RATE_LIMIT.API_DELAY);
        await importAllWorkouts();
        Utilities.sleep(RATE_LIMIT.API_DELAY);
      }

      // Track execution time
      const executionTime = Date.now() - startTime;
      QuotaTracker.recordExecutionTime(executionTime);

      // Check quota warnings
      const quotaWarning = QuotaTracker.checkQuotaWarnings();
      if (quotaWarning) {
        console.warn("Quota warning:", quotaWarning);
      }

      SpreadsheetApp.getActiveSpreadsheet().toast(
        "Initial import complete. Automatic imports will now run each time you open the sheet.",
        "Setup Complete",
        TOAST_DURATION.NORMAL
      );
    } catch (error) {
      // Track execution time even on error
      const executionTime = Date.now() - startTime;
      QuotaTracker.recordExecutionTime(executionTime);

      this._apiKeyCheckInProgress = false;

      if (
        error instanceof ApiError &&
        error.statusCode === HTTP_STATUS.UNAUTHORIZED
      ) {
        SpreadsheetApp.getUi().alert(
          "Invalid API Key",
          "Your Hevy API key appears to be invalid or expired. Please update it now.",
          SpreadsheetApp.getUi().ButtonSet.OK
        );
        showInitialSetup();
        return;
      }

      throw ErrorHandler.handle(error, { operation: "Initial data import" });
    }
  }

  /**
   * Fetches a single page of data
   * @private
   */
  async fetchPage(endpoint, apiKey, page, pageSize, additionalParams) {
    const queryParams = {
      page,
      page_size: pageSize,
      ...additionalParams,
    };

    return await this.makeRequest(
      endpoint,
      this.createRequestOptions(apiKey),
      queryParams
    );
  }

  /**
   * Process page data and determines if more pages exist
   * @private
   * @param {Object} response - API response
   * @param {string} dataKey - Key in response containing data array
   * @param {Function} processFn - Function to process data
   * @param {number} pageSize - Size of each page
   * @param {number} page - Current page number
   * @returns {Promise<{processedCount: number, hasMore: boolean}>}
   */
  async processPageData(response, dataKey, processFn, pageSize, page) {
    const items = response[dataKey] || [];
    if (items.length === 0) {
      return { processedCount: 0, hasMore: false };
    }

    await processFn(items);

    return {
      processedCount: items.length,
      hasMore:
        items.length === pageSize &&
        (!response.page_count || page < response.page_count),
    };
  }

  /**
   * Serializes payload for request
   * @param {*} payload - Request payload
   * @returns {string} Serialized payload
   * @private
   */
  _serializePayload(payload) {
    if (typeof payload === "string") return payload;
    if (payload?.body) return payload.body;
    return JSON.stringify(payload);
  }

  /**
   * Checks if error should be retried
   * @param {Error} error - The error to check
   * @param {number} attempt - Current attempt number
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
   * Checks circuit breaker state and throws if circuit is open
   * @param {string} endpoint - API endpoint for context
   * @throws {ApiError} If circuit breaker is open
   * @private
   */
  _checkCircuitBreaker(endpoint) {
    const cb = this.circuitBreaker;
    const now = Date.now();

    // Check if we should transition from OPEN to HALF_OPEN
    if (
      cb.state === "OPEN" &&
      cb.lastFailureTime &&
      now - cb.lastFailureTime > cb.resetTimeout
    ) {
      cb.state = "HALF_OPEN";
      cb.failures = 0;
    }

    // If circuit is open, reject immediately
    if (cb.state === "OPEN") {
      throw new ApiError(
        "Circuit breaker is open. API is temporarily unavailable.",
        HTTP_STATUS.SERVICE_UNAVAILABLE,
        null,
        {
          endpoint,
          circuitBreakerState: cb.state,
          lastFailureTime: cb.lastFailureTime,
        }
      );
    }
  }

  /**
   * Records a successful request for circuit breaker
   * @private
   */
  _recordSuccess() {
    const cb = this.circuitBreaker;
    if (cb.state === "HALF_OPEN") {
      // Success in half-open state, close the circuit
      cb.state = "CLOSED";
      cb.failures = 0;
      cb.lastFailureTime = null;
    } else if (cb.state === "CLOSED") {
      // Reset failure count on success
      cb.failures = 0;
    }
  }

  /**
   * Records a failed request for circuit breaker
   * @param {Error} error - The error that occurred
   * @private
   */
  _recordFailure(error) {
    const cb = this.circuitBreaker;
    cb.failures++;
    cb.lastFailureTime = Date.now();

    // Open circuit if threshold exceeded
    if (cb.failures >= cb.failureThreshold) {
      cb.state = "OPEN";
      console.warn(
        `Circuit breaker opened after ${cb.failures} failures. Will retry after ${cb.resetTimeout}ms.`
      );
    }
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
    // Check circuit breaker before making request
    this._checkCircuitBreaker(endpoint);

    const cacheKey = this.getCacheKey(endpoint, queryParams);

    // Check in-memory cache first
    if (options.method === "GET" && this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    // Check persistent cache (CacheService) for GET requests
    if (options.method === "GET") {
      const persistentCache = CacheService.getDocumentCache();
      const cached = persistentCache.get(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // Also store in memory cache for faster access
          this.cache[cacheKey] = parsed;
          return parsed;
        } catch (parseError) {
          // If parsing fails, remove from cache and continue
          persistentCache.remove(cacheKey);
        }
      }
    }

    const url = this.buildUrl(endpoint, queryParams);
    if (payload) {
      options.payload = this._serializePayload(payload);
    }

    let lastError;
    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(url, options);
        const parsedResponse = this.handleResponse(response);

        // Record success for circuit breaker
        this._recordSuccess();

        // Cache successful GET responses
        if (options.method === "GET") {
          // Store in memory cache with LRU eviction
          if (!this.cache[cacheKey]) {
            // Check if we need to evict old entries
            if (this._cacheSize >= CACHE_CONFIG.MAX_MEMORY_CACHE_SIZE) {
              this._evictOldestCacheEntry();
            }
            this._cacheSize++;
          }
          this.cache[cacheKey] = parsedResponse;

          // Store in persistent cache with configured TTL
          try {
            const persistentCache = CacheService.getDocumentCache();
            persistentCache.put(
              cacheKey,
              JSON.stringify(parsedResponse),
              CACHE_CONFIG.TTL_SECONDS
            );
          } catch (cacheError) {
            // If cache fails, log but don't fail the request
            console.warn("Failed to cache response:", cacheError);
          }
        }

        return parsedResponse;
      } catch (error) {
        lastError = error;

        // Record failure for circuit breaker (only for non-retryable or final attempt)
        if (
          !this._shouldRetry(error, attempt) ||
          attempt === this.retryConfig.maxRetries - 1
        ) {
          this._recordFailure(error);
        }

        if (!this._shouldRetry(error, attempt)) {
          throw ErrorHandler.handle(error, {
            endpoint,
            queryParams,
            attempt,
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
   * @example
   * const options = apiClient.createRequestOptions(apiKey, "POST", {
   *   "Custom-Header": "value"
   * });
   */
  createRequestOptions(apiKey, method = "get", additionalHeaders = {}) {
    return {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": apiKey,
        ...additionalHeaders,
      },
      muteHttpExceptions: true,
      validateHttpsCertificates: true,
      followRedirects: true,
      timeout: API_CLIENT_CONFIG.REQUEST_TIMEOUT_MS,
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
   * Handles API response parsing and error checking
   * Also extracts and stores rate limit information from response headers
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - Response from UrlFetchApp
   * @returns {Object} Parsed response data
   * @throws {ApiError} If response indicates an error
   */
  handleResponse(response) {
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();
    const headers = response.getHeaders();

    // Extract and store rate limit information from headers
    this._updateRateLimitInfo(headers);

    if (statusCode === HTTP_STATUS.NO_CONTENT) return null;

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
          {
            operation: "Parsing API response",
          }
        );
      }
    }

    const errorMessages = {
      [HTTP_STATUS.BAD_REQUEST]: "Invalid request parameters",
      [HTTP_STATUS.UNAUTHORIZED]: "Invalid API key",
      [HTTP_STATUS.FORBIDDEN]: "Access forbidden",
      [HTTP_STATUS.NOT_FOUND]: "Resource not found",
      [HTTP_STATUS.TOO_MANY_REQUESTS]: "Rate limit exceeded",
    };

    throw ErrorHandler.handle(
      new ApiError(
        errorMessages[statusCode] ||
          `API request failed with status ${statusCode}`,
        statusCode,
        responseText
      ),
      {
        operation: "API response error",
      }
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
      .filter(([_, value]) => value != null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");
  }

  /**
   * Generates a consistent cache key string for GET requests.
   * @param {string} endpoint
   * @param {Object} queryParams
   * @returns {string}
   */
  getCacheKey(endpoint, queryParams) {
    return `${endpoint}?${this.buildQueryString(queryParams)}`;
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
   * Updates rate limit information from API response headers
   * Stores rate limit state in CacheService for persistence across executions
   * @param {Object<string, string>} headers - Response headers
   * @private
   */
  _updateRateLimitInfo(headers) {
    const rateLimitRemaining =
      headers["X-RateLimit-Remaining"] || headers["x-ratelimit-remaining"];
    const rateLimitReset =
      headers["X-RateLimit-Reset"] || headers["x-ratelimit-reset"];
    const rateLimitLimit =
      headers["X-RateLimit-Limit"] || headers["x-ratelimit-limit"];

    if (rateLimitRemaining || rateLimitReset || rateLimitLimit) {
      const rateLimitInfo = {
        remaining: rateLimitRemaining ? parseInt(rateLimitRemaining) : null,
        reset: rateLimitReset ? parseInt(rateLimitReset) : null,
        limit: rateLimitLimit ? parseInt(rateLimitLimit) : null,
        timestamp: Date.now(),
      };

      // Store in persistent cache for cross-execution access
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

      // Warn if approaching rate limit
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

  /**
   * Clears all caches (memory and persistent)
   * Useful for testing or when cache needs to be invalidated
   */
  clearCache() {
    this.cache = {};
    this._cacheSize = 0;
    try {
      const persistentCache = CacheService.getDocumentCache();
      persistentCache.removeAll(Object.keys(this.cache));
    } catch (error) {
      console.warn("Failed to clear persistent cache:", error);
    }
  }
}

// Export singleton instance
const apiClient = new ApiClient();
