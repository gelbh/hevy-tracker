/**
 * Enhanced API utility functions with better type handling and resilience.
 */
class ApiClient {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };
  }

  /**
   * Gets API key or prompts user to set one if not found
   * @private
   */
  getOrPromptApiKey() {
    const properties = this.getProperties();
    const key = properties.getProperty("HEVY_API_KEY");

    if (!key) {
      this.promptForApiKey(
        "An API key is required. Would you like to set it now?"
      );
      return null;
    }

    return key;
  }

  /**
   * Shows the API key management dialog
   */
  manageHevyApiKey() {
    const properties = this.getProperties();
    const currentKey = properties.getProperty("HEVY_API_KEY");

    if (currentKey && !this.confirmKeyReset()) {
      return;
    }

    showHtmlDialog("src/ui/dialogs/ApiKeyDialog", {
      width: 450,
      height: 250,
      title: "Hevy API Key Setup",
    });
  }

  /**
   * Saves the API key and initiates initial data import if needed
   * @param {string} apiKey - The API key to save
   */
  async saveHevyApiKey(apiKey) {
    try {
      await this.validateApiKey(apiKey);

      const properties = this.getProperties();
      const currentKey = properties.getProperty("HEVY_API_KEY");
      properties.setProperty("HEVY_API_KEY", apiKey);

      this.handleSuccessfulSave(currentKey);
    } catch (error) {
      this.handleSaveError(error);
    }
  }

  /**
   * Makes a paginated API request
   * @async
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
        const result = await this.processPageData(response, dataKey, processFn);

        totalProcessed += result.processedCount;
        hasMore = result.hasMore;

        if (hasMore) {
          page++;
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      } catch (error) {
        if (this.isPaginationComplete(error)) {
          break;
        }
        throw error;
      }
    }

    Logger.debug("Completed paginated fetch", {
      totalProcessed,
      totalPages: page - 1,
    });
    return totalProcessed;
  }

  // Private helper methods

  /**
   * Gets properties service with error handling
   * @private
   */
  getProperties() {
    const properties = getUserProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access user properties");
    }
    return properties;
  }

  /**
   * Shows a prompt to set or reset the API key
   * @private
   */
  promptForApiKey(message) {
    const ui = SpreadsheetApp.getUi();
    if (
      ui.alert("Hevy API Key Required", message, ui.ButtonSet.YES_NO) ===
      ui.Button.YES
    ) {
      this.manageHevyApiKey();
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
   * @private
   */
  async validateApiKey(apiKey) {
    const url = `${API_ENDPOINTS.BASE}${API_ENDPOINTS.EXERCISES}?page=1&page_size=1`;
    const options = this.createRequestOptions(apiKey);
    const response = await this.executeRequest(url, options);

    if (response.getResponseCode() === 401) {
      throw new InvalidApiKeyError("Invalid or revoked API key");
    }

    return true;
  }

  /**
   * Handles successful API key save
   * @private
   */
  handleSuccessfulSave(currentKey) {
    if (!currentKey) {
      setTimeout(() => {
        showProgress(
          "API key set successfully. Starting initial data import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
        this.runInitialImport();
      }, 0);
    } else {
      showProgress(
        "API key updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    }
  }

  /**
   * Handles API key save errors
   * @private
   */
  handleSaveError(error) {
    if (error instanceof InvalidApiKeyError) {
      const properties = this.getProperties();
      properties.deleteProperty("HEVY_API_KEY");

      const ui = SpreadsheetApp.getUi();
      ui.alert(
        "Invalid API Key",
        "The provided API key appears to be invalid or revoked. Please check your Hevy Developer Settings and try again.",
        ui.ButtonSet.OK
      );

      this.promptForApiKey("Would you like to set a new API key?");
    }

    throw error;
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
   * Processes page data and determines if more pages exist
   * @private
   */
  async processPageData(response, dataKey, processFn) {
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
   * Checks if pagination is complete based on error
   * @private
   */
  isPaginationComplete(error) {
    return error instanceof ApiError && error.statusCode === 404;
  }

  /**
   * Makes an API request with error handling and retries
   * @async
   * @param {string} endpoint - The API endpoint to request
   * @param {Object} options - Request options
   * @param {Object} [queryParams={}] - Query parameters
   * @returns {Promise<Object>} Parsed response data
   * @throws {ApiError} If request fails after retries
   */
  async makeRequest(endpoint, options, queryParams = {}) {
    const url = this.buildUrl(endpoint, queryParams);
    let attempt = 0;
    let lastError;

    while (attempt < this.retryConfig.maxRetries) {
      try {
        const response = await this.executeRequest(url, options);
        return this.handleResponse(response);
      } catch (error) {
        lastError = error;

        if (
          !(error instanceof ApiError) ||
          !error.isRetryable() ||
          attempt === this.retryConfig.maxRetries - 1
        ) {
          handleError(error, {
            endpoint,
            queryParams,
            attempt,
          });
        }

        const delay = this.calculateBackoff(attempt);
        Utilities.sleep(delay);
        attempt++;
      }
    }

    handleError(lastError, {
      endpoint,
      queryParams,
      attempt: this.retryConfig.maxRetries,
    });
  }

  /**
   * Creates standardized request options for API calls
   * @param {string} apiKey - API key for authentication
   * @param {string} [method='get'] - HTTP method to use
   * @param {Object} [additionalHeaders={}] - Additional HTTP headers
   * @returns {Object} Request options object for UrlFetchApp
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
    };
  }

  /**
   * Executes an HTTP request using UrlFetchApp
   * @param {string} url - The URL to request
   * @param {Object} options - Request options
   * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse} Response object
   */
  executeRequest(url, options) {
    return UrlFetchApp.fetch(url, options);
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
    // Add random jitter between 50% and 100% of calculated delay
    return delay * (0.5 + Math.random() * 0.5);
  }

  /**
   * Handles API response parsing and error checking
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - Response from UrlFetchApp
   * @returns {Object} Parsed response data
   * @throws {ApiError} If response indicates an error
   */
  handleResponse(response) {
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 204) {
      return null;
    }

    if (statusCode >= 200 && statusCode < 300) {
      try {
        return JSON.parse(responseText);
      } catch (e) {
        throw new ApiError(
          "Invalid JSON response from API",
          statusCode,
          responseText
        );
      }
    }

    const errorMessages = {
      400: "Invalid request parameters",
      401: "Invalid API key",
      403: "Access forbidden",
      404: "Resource not found",
      429: "Rate limit exceeded",
    };

    throw new ApiError(
      errorMessages[statusCode] ||
        `API request failed with status ${statusCode}`,
      statusCode,
      responseText
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
}

// Export singleton instance
const apiClient = new ApiClient();
