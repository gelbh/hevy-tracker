/**
 * Enhanced API utility functions with better type handling and resilience.
 */

class ApiClient {
  /**
   * Creates a new ApiClient instance with default retry configuration
   * @constructor
   */
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
   * @returns {string|null} The API key if found or set, null if user cancels
   */
  getOrPromptApiKey() {
    const properties = getUserProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access user properties");
    }

    const key = properties.getProperty("HEVY_API_KEY");
    if (!key) {
      // Show prompt to set API key
      const ui = SpreadsheetApp.getUi();
      const response = ui.alert(
        "Hevy API Key Required",
        "An API key is required. Would you like to set it now?",
        ui.ButtonSet.YES_NO
      );

      if (response === ui.Button.YES) {
        this.manageHevyApiKey();
      }
      return null;
    }

    return key;
  }

  /**
   * Shows the API key management dialog
   * Allows users to set or reset their Hevy API key
   */
  manageHevyApiKey() {
    const properties = getUserProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access user properties");
    }

    const currentKey = properties.getProperty("HEVY_API_KEY");

    if (currentKey) {
      const ui = SpreadsheetApp.getUi();
      const response = ui.alert(
        "Hevy API Key Management",
        "A Hevy API key is already set. Would you like to reset it?",
        ui.ButtonSet.YES_NO
      );

      if (response !== ui.Button.YES) {
        return;
      }
    }

    showHtmlDialog("src/ui/dialogs/ApiKeyDialog", {
      width: 450,
      height: 250,
      title: "Hevy API Key Setup",
    });
  }

  /**
   * Retrieves the stored HEVY API key
   * @returns {string} The stored API key
   * @throws {ConfigurationError} If API key is not found
   */
  getApiKey() {
    const properties = getUserProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access user properties");
    }

    const key = properties.getProperty("HEVY_API_KEY");
    if (!key) {
      throw new ConfigurationError(
        'HEVY API key not found. Please set it up using the "Set Hevy API Key" menu option.'
      );
    }

    return key;
  }

  /**
   * Saves the API key and initiates initial data import if needed
   * @param {string} apiKey - The API key to save
   * @throws {Error} If saving fails or import fails
   */
  saveHevyApiKey(apiKey) {
    try {
      const properties = getUserProperties();
      if (!properties) {
        throw new ConfigurationError("Unable to access user properties");
      }

      const currentKey = properties.getProperty("HEVY_API_KEY");
      properties.setProperty("HEVY_API_KEY", apiKey);

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
    } catch (error) {
      handleError(error, "Saving Hevy API key");
      throw error;
    }
  }

  /**
   * Runs initial data import sequence for new API key setup
   */
  runInitialImport() {
    try {
      const apiKey = this.getOrPromptApiKey();
      if (!apiKey) return;

      const properties = getUserProperties();
      if (!properties) {
        throw new ConfigurationError("Unable to access user properties");
      }

      properties.deleteProperty("LAST_WORKOUT_UPDATE");

      transferWeightHistory(false);

      properties.setProperty("WEIGHT_TRANSFER_IN_PROGRESS", "true");

      importAllRoutineFolders();
      Utilities.sleep(RATE_LIMIT.API_DELAY);

      importAllExercises();
      Utilities.sleep(RATE_LIMIT.API_DELAY);

      importAllRoutines();
      Utilities.sleep(RATE_LIMIT.API_DELAY);

      importAllWorkouts();

      properties.deleteProperty("WEIGHT_TRANSFER_IN_PROGRESS");
    } catch (error) {
      if (properties) {
        properties.deleteProperty("WEIGHT_TRANSFER_IN_PROGRESS");
      }
      handleError(error, "Running initial import");
    }
  }

  /**
   * Makes a paginated API request with improved batching and progress tracking
   * @async
   * @param {string} endpoint - API endpoint to request
   * @param {number} pageSize - Number of items per page
   * @param {Function} processFn - Function to process each page of data
   * @param {string} dataKey - Key in response containing the data array
   * @param {Object} [additionalParams={}] - Additional query parameters
   * @returns {Promise<number>} Total number of processed items
   * @throws {ApiError} If API request fails
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
        const queryParams = {
          page,
          page_size: pageSize,
          ...additionalParams,
        };

        const response = await this.makeRequest(
          endpoint,
          this.createRequestOptions(apiKey),
          queryParams
        );

        const items = response[dataKey] || [];
        if (items.length > 0) {
          await processFn(items);
          totalProcessed += items.length;

          hasMore =
            items.length === pageSize &&
            (!response.page_count || page < response.page_count);

          page++;
        } else {
          hasMore = false;
        }

        if (hasMore) {
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) {
          Logger.debug("Reached end of pagination (404)", { page });
          hasMore = false;
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
