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
    this.cache = {};
    this._cacheSize = 0; // Track cache size for LRU eviction
    this._apiKeyCheckInProgress = false;
    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: "CLOSED", // CLOSED, OPEN, HALF_OPEN
      failureThreshold: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      resetTimeout: config.CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
    };
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
    return properties?.getProperty("HEVY_API_KEY") ?? null;
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
    showHtmlDialog("ui/dialogs/SetApiKey", {
      width: DIALOG_DIMENSIONS.API_KEY_WIDTH,
      height: DIALOG_DIMENSIONS.API_KEY_HEIGHT,
    });
  }

  /**
   * Saves the API key and initiates initial data import if needed
   * Saves synchronously first, then validates in background for reliability
   * @param {string} apiKey - The API key to save
   * @throws {ValidationError} If API key format is invalid
   */
  saveUserApiKey(apiKey) {
    // Server-side validation: Validate API key format before saving
    if (!apiKey || typeof apiKey !== "string") {
      throw new ValidationError("API key must be a non-empty string");
    }

    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("API key cannot be empty");
    }

    // UUID v4 format validation: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // 8-4-4-4-12 hexadecimal characters
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      throw new ValidationError(
        "Invalid API key format. API key must be a valid UUID (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
      );
    }

    // Length validation (UUID should be exactly 36 characters including hyphens)
    if (trimmed.length !== 36) {
      throw new ValidationError("API key must be exactly 36 characters long.");
    }

    // Save API key first (synchronously) - this ensures immediate completion
    const properties = this._getDocumentProperties();
    const currentKey = properties.getProperty("HEVY_API_KEY");

    // Use trimmed key for storage
    const apiKeyToSave = trimmed;

    properties.setProperty("HEVY_API_KEY", apiKeyToSave);
    properties.deleteProperty("LAST_WORKOUT_UPDATE");
    this._apiKeyCheckInProgress = false;

    // Schedule import via trigger to avoid blocking the dialog
    if (!currentKey) {
      this._showToast(
        "API key set successfully. Starting initial data import...",
        "Setup Progress",
        TOAST_DURATION.NORMAL
      );
      // Schedule import to run in separate execution context via trigger
      // This prevents blocking the dialog and allows it to close immediately
      this._scheduleInitialImport();
    } else {
      this._showToast(
        "API key updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    }

    // Return immediately after saving - don't wait for background operations
    // This ensures the HTML dialog can close without timeout

    // Validate API key in background - if it fails, remove the key
    this.validateApiKey(apiKeyToSave)
      .then(() => {
        // Validation succeeded - key is valid
        console.log("API key validation succeeded");
      })
      .catch((error) => {
        // Validation failed - remove the key and notify user
        console.error("API key validation failed:", error);

        // Remove the invalid key
        const props = this._getDocumentProperties();
        props.deleteProperty("HEVY_API_KEY");
        props.deleteProperty("LAST_WORKOUT_UPDATE");

        // Show error toast to user
        const errorMessage =
          error instanceof InvalidApiKeyError
            ? "Invalid API key. Please check your Hevy Developer Settings and reset your API key."
            : "API key validation failed. Please check your connection and try again.";

        this._showToast(errorMessage, "API Key Error", TOAST_DURATION.LONG);

        // Log for debugging
        ErrorHandler.handle(
          error,
          {
            operation: "Validating API key (background)",
            context:
              "Key was saved but validation failed, key has been removed",
          },
          false // Don't show additional toast, we already showed one
        );
      });
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
   * Shows a toast notification
   * @param {string} message - Toast message
   * @param {string} title - Toast title
   * @param {number} duration - Toast duration
   * @private
   */
  _showToast(message, title, duration = TOAST_DURATION.NORMAL) {
    getActiveSpreadsheet().toast(message, title, duration);
  }

  /**
   * Executes an import step with progress tracking
   * @param {string} stepName - Name of the import step
   * @param {Function} importFn - Async function to execute
   * @param {Array<string>} completedSteps - Array of completed steps
   * @param {Function} checkTimeout - Function to check for timeout
   * @private
   */
  async _executeImportStep(stepName, importFn, completedSteps, checkTimeout) {
    if (ImportProgressTracker.isStepComplete(stepName)) {
      return;
    }

    if (checkTimeout && checkTimeout()) {
      return;
    }

    this._showToast(
      `Starting import: ${stepName}...`,
      "Import Progress",
      TOAST_DURATION.SHORT
    );

    try {
      await importFn();
      // Reload completed steps from properties to handle concurrent execution
      // This ensures we have the latest state if other steps completed concurrently
      const currentProgress = ImportProgressTracker.loadProgress();
      const updatedSteps = currentProgress?.completedSteps ?? [];
      if (!updatedSteps.includes(stepName)) {
        updatedSteps.push(stepName);
      }
      // Also update the local array for consistency
      if (!completedSteps.includes(stepName)) {
        completedSteps.push(stepName);
      }
      ImportProgressTracker.saveProgress(updatedSteps);
      this._showToast(
        `Completed: ${stepName} ✓`,
        "Import Progress",
        TOAST_DURATION.SHORT
      );
    } catch (error) {
      // Re-throw ImportTimeoutError to be handled by runFullImport
      if (error instanceof ImportTimeoutError) {
        throw error;
      }
      // Re-throw other errors
      throw error;
    }
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
   * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
   * @returns {Promise<number>} Total number of items processed across all pages
   * @throws {ApiError} If API request fails
   * @throws {ImportTimeoutError} If timeout is detected
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
    additionalParams = {},
    checkTimeout = null
  ) {
    const apiKey = this.getOrPromptApiKey();
    if (!apiKey) return 0;

    let page = 1;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      try {
        // Check timeout before each page fetch
        if (checkTimeout && checkTimeout()) {
          throw new ImportTimeoutError(
            `Timeout approaching while fetching ${endpoint} (page ${page})`
          );
        }

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
        // Re-throw ImportTimeoutError
        if (error instanceof ImportTimeoutError) {
          throw error;
        }
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

    // Safety check: If we hit the maximum page limit, something is wrong
    if (page > MAX_PAGES) {
      throw ErrorHandler.handle(
        new Error(
          `Maximum page limit (${MAX_PAGES}) reached while fetching ${endpoint}. ` +
            "This may indicate an infinite loop or API inconsistency. " +
            `Total items processed: ${totalProcessed}`
        ),
        {
          endpoint,
          page,
          totalProcessed,
          operation: "Fetching paginated data - maximum page limit exceeded",
        }
      );
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
    const config = this._getApiClientConfig();
    const options = {
      ...this.createRequestOptions(apiKey),
      timeout: config.VALIDATION_TIMEOUT_MS,
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
      if (this._isNetworkError(error)) {
        throw new Error(
          "Request timed out. Please check your internet connection and try again."
        );
      }
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
   * Schedules the initial import to run via a time-based trigger
   * This prevents blocking the dialog by running the import in a separate execution context
   * @private
   */
  _scheduleInitialImport() {
    try {
      // Delete any existing "runInitialImport" triggers to prevent duplicates
      const triggers = ScriptApp.getProjectTriggers();
      triggers
        .filter(
          (t) =>
            t.getHandlerFunction() === "runInitialImport" &&
            t.getEventType() === ScriptApp.EventType.CLOCK
        )
        .forEach((t) => ScriptApp.deleteTrigger(t));

      // Create a new time-based trigger that fires 2 seconds from now
      const triggerTime = new Date(Date.now() + 2000);
      ScriptApp.newTrigger("runInitialImport")
        .timeBased()
        .at(triggerTime)
        .create();
    } catch (error) {
      // Log error but don't throw - import can still happen manually
      console.error("Failed to schedule initial import:", error);
      ErrorHandler.handle(
        error,
        { operation: "Scheduling initial import trigger" },
        false
      );
    }
  }

  /**
   * Cancels any pending runInitialImport triggers
   * Called when a manual import starts to prevent duplicate imports
   * @private
   */
  _cancelPendingInitialImportTriggers() {
    try {
      const triggers = ScriptApp.getProjectTriggers();
      const cancelledTriggers = triggers.filter(
        (t) =>
          t.getHandlerFunction() === "runInitialImport" &&
          t.getEventType() === ScriptApp.EventType.CLOCK
      );

      if (cancelledTriggers.length > 0) {
        cancelledTriggers.forEach((t) => ScriptApp.deleteTrigger(t));
        console.log(
          `Cancelled ${cancelledTriggers.length} pending initial import trigger(s)`
        );
      }
    } catch (error) {
      // Log error but don't throw - import can still proceed
      console.warn("Failed to cancel pending triggers:", error);
    }
  }

  /**
   * Sets up weight import formula for authorized API key
   * @private
   */
  _setupAuthorizedWeightImport() {
    const ss = getActiveSpreadsheet();
    const weightSheet = ss.getSheetByName(WEIGHT_SHEET_NAME);
    if (!weightSheet) {
      throw ErrorHandler.handle(
        new SheetError(
          `Sheet "${WEIGHT_SHEET_NAME}" not found`,
          WEIGHT_SHEET_NAME
        ),
        {
          operation: "Setting up authorized weight import",
        }
      );
    }
    weightSheet
      .getRange("A2")
      .setFormula(
        'IF(TRUE, ARRAYFORMULA(IMPORTRANGE("1vKDObz3ZHoeEBZsyUCpb85AUX3Sc_4V2OmNSyxPEd68", "Weight History!A2:B") * {1, WEIGHT_CONVERSION_FACTOR(Main!$I$5)}), "")'
      );
  }

  /**
   * Runs initial data import sequence for new API key setup
   * Includes timeout protection and progress checkpointing for resumable imports
   * @param {string} [apiKeyOverride=null] - Optional API key to use instead of reading from properties
   * @param {boolean} [skipResumeDialog=false] - If true, skip the resume dialog and start fresh automatically
   */
  async runFullImport(apiKeyOverride = null, skipResumeDialog = false) {
    const startTime = Date.now();
    let completedSteps = [];
    const lock = LockService.getScriptLock();
    let lockAcquired = false;
    let lastHeartbeat = startTime;

    try {
      // Try to acquire lock to prevent concurrent execution
      try {
        lock.waitLock(30000); // Wait up to 30 seconds for lock
        lockAcquired = true;
      } catch (lockError) {
        // Lock acquisition failed - fall back to active import check
        console.warn(
          "Failed to acquire lock, checking active import status:",
          lockError
        );
      }

      // Check if import is already active (using document properties as fallback)
      if (ImportProgressTracker.isImportActive()) {
        this._showToast(
          "Import already in progress. Please wait for it to complete.",
          "Import Active",
          TOAST_DURATION.NORMAL
        );
        return;
      }

      // Validate API key BEFORE marking import as active
      // This prevents marking as active if validation fails
      const apiKey = apiKeyOverride ?? this._getApiKeyFromProperties();
      if (!apiKey) {
        showInitialSetup();
        return;
      }

      // Mark import as active and cancel any pending triggers
      // Only reaches here if API key validation passed
      ImportProgressTracker.markImportActive();
      this._cancelPendingInitialImportTriggers();

      const ss = getActiveSpreadsheet();
      this._ensureImportTrigger(ss);

      if (checkForMultiLoginIssues()) {
        this._showToast(
          "Multi-login warning shown. Continuing with import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
      }

      if (apiKey === AUTHORIZED_API_KEY) {
        this._setupAuthorizedWeightImport();
      }

      // Check for existing progress and prompt user
      const existingProgress = ImportProgressTracker.loadProgress();
      if (existingProgress?.completedSteps?.length > 0) {
        if (skipResumeDialog) {
          // Skip dialog and automatically start fresh when called from saveUserApiKey
          ImportProgressTracker.clearProgress();
          completedSteps = [];
          this._showToast(
            "Starting fresh import...",
            "Import Started",
            TOAST_DURATION.NORMAL
          );
        } else {
          // Show resume dialog for manual imports
          const ui = SpreadsheetApp.getUi();
          const response = ui.alert(
            "Resume Import?",
            `Previous import was incomplete. ${existingProgress.completedSteps.length} step(s) completed.\n\nResume from where it left off, or start fresh?`,
            ui.ButtonSet.YES_NO_CANCEL
          );

          if (response === ui.Button.YES) {
            // Resume: use existing completed steps
            completedSteps = existingProgress.completedSteps;
            this._showToast(
              `Resuming import. Skipping ${completedSteps.length} completed step(s)...`,
              "Resuming Import",
              TOAST_DURATION.NORMAL
            );
          } else if (response === ui.Button.NO) {
            ImportProgressTracker.clearProgress();
            completedSteps = [];
            this._showToast(
              "Starting fresh import...",
              "Import Started",
              TOAST_DURATION.NORMAL
            );
          } else {
            // Cancel
            return;
          }
        }
      }

      const isTemplate = ss.getId() === TEMPLATE_SPREADSHEET_ID;

      // Helper function to check timeout, update heartbeat, and save progress if needed
      const checkTimeout = () => {
        const now = Date.now();
        const elapsed = now - startTime;

        // Update heartbeat if needed (every ACTIVE_IMPORT_HEARTBEAT_MS)
        if (now - lastHeartbeat >= ACTIVE_IMPORT_HEARTBEAT_MS) {
          ImportProgressTracker.updateImportActiveHeartbeat();
          lastHeartbeat = now;
        }

        if (elapsed > MAX_IMPORT_EXECUTION_TIME_MS) {
          ImportProgressTracker.saveProgress(completedSteps);
          this._showToast(
            "Import paused due to time limit. Run 'Import All' again to resume.",
            "Import Paused",
            TOAST_DURATION.LONG
          );
          return true;
        }
        return false;
      };

      // Import Exercises, Routine Folders, and Routines concurrently
      // These are independent operations that can run in parallel
      if (!isTemplate) {
        // Run exercises, routine folders, and routines concurrently
        await Promise.all([
          this._executeImportStep(
            "exercises",
            () => importAllExercises(checkTimeout),
            completedSteps,
            checkTimeout
          ),
          this._executeImportStep(
            "routineFolders",
            () => importAllRoutineFolders(checkTimeout),
            completedSteps,
            checkTimeout
          ),
          this._executeImportStep(
            "routines",
            () => importAllRoutines(checkTimeout),
            completedSteps,
            checkTimeout
          ),
        ]);

        // Import Workouts after exercises (for localized exercise name mapping)
        await this._executeImportStep(
          "workouts",
          () => importAllWorkouts(checkTimeout),
          completedSteps,
          checkTimeout
        );
      } else {
        // Template mode: only import exercises
        await this._executeImportStep(
          "exercises",
          () => importAllExercises(checkTimeout),
          completedSteps,
          checkTimeout
        );
      }

      // All steps completed - clear progress and show success
      ImportProgressTracker.clearProgress();

      // Track execution time
      const executionTime = Date.now() - startTime;
      QuotaTracker.recordExecutionTime(executionTime);

      // Check quota warnings
      const quotaWarning = QuotaTracker.checkQuotaWarnings();
      if (quotaWarning) {
        console.warn("Quota warning:", quotaWarning);
      }

      this._showToast(
        "Import complete! All data synced successfully.",
        "Setup Complete",
        TOAST_DURATION.NORMAL
      );
    } catch (error) {
      // Track execution time even on error
      const executionTime = Date.now() - startTime;
      QuotaTracker.recordExecutionTime(executionTime);

      // Save progress before error handling (in case of timeout)
      if (completedSteps.length > 0) {
        ImportProgressTracker.saveProgress(completedSteps);
      }

      this._apiKeyCheckInProgress = false;

      // Handle ImportTimeoutError specifically
      if (error instanceof ImportTimeoutError) {
        this._showToast(
          "Import complete, but some post-processing was skipped due to time limit.",
          "Import Complete (Partial)",
          TOAST_DURATION.LONG
        );
        // Don't throw - import was successful, just post-processing timed out
        return;
      }

      // Check if this is a timeout error (Apps Script execution limit)
      if (
        error.message &&
        (error.message.includes("Exceeded maximum execution time") ||
          error.message.includes("timeout"))
      ) {
        this._showToast(
          "Import paused due to time limit. Run 'Import All' again to resume.",
          "Import Paused",
          TOAST_DURATION.LONG
        );
        return;
      }

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
    } finally {
      // Always cleanup: clear active import flag and release lock
      try {
        ImportProgressTracker.clearImportActive();
      } catch (cleanupError) {
        console.warn("Failed to clear active import flag:", cleanupError);
      }

      if (lockAcquired) {
        try {
          lock.releaseLock();
        } catch (lockError) {
          console.warn("Failed to release lock:", lockError);
        }
      }
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
    const items = response[dataKey] ?? [];
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
    return JSON.stringify(payload ?? {});
  }

  /**
   * Retry Logic
   */

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
   * Circuit Breaker Management
   */

  /**
   * Checks and updates circuit breaker state before making request
   * @param {string} endpoint - API endpoint for context
   * @throws {ApiError} If circuit breaker is open
   * @private
   */
  _checkCircuitBreaker(endpoint) {
    const cb = this.circuitBreaker;
    const now = Date.now();

    // Transition from OPEN to HALF_OPEN if reset timeout has passed
    if (
      cb.state === "OPEN" &&
      cb.lastFailureTime &&
      now - cb.lastFailureTime > cb.resetTimeout
    ) {
      cb.state = "HALF_OPEN";
      cb.failures = 0;
    }

    // Reject immediately if circuit is open
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
   * Records a successful request for circuit breaker state management
   * @private
   */
  _recordSuccess() {
    const cb = this.circuitBreaker;
    if (cb.state === "HALF_OPEN") {
      cb.state = "CLOSED";
      cb.failures = 0;
      cb.lastFailureTime = null;
    } else if (cb.state === "CLOSED") {
      cb.failures = 0;
    }
  }

  /**
   * Records a failed request and updates circuit breaker state
   * @param {Error} error - The error that occurred
   * @private
   */
  _recordFailure(error) {
    const cb = this.circuitBreaker;
    cb.failures++;
    cb.lastFailureTime = Date.now();

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
  /**
   * Cache Management
   */

  /**
   * Gets cached response for GET requests
   * @param {string} cacheKey - Cache key for the request
   * @returns {Object|null} Cached response or null if not found
   * @private
   */
  _getCachedResponse(cacheKey) {
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
   * @private
   */
  _storeInCache(cacheKey, response) {
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

  async makeRequest(endpoint, options, queryParams = {}, payload = null) {
    this._checkCircuitBreaker(endpoint);

    const cacheKey = this.getCacheKey(endpoint, queryParams);
    const isGetRequest = options.method === "GET";

    // Check cache for GET requests
    if (isGetRequest) {
      const cached = this._getCachedResponse(cacheKey);
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

        this._recordSuccess();

        // Cache successful GET responses
        if (isGetRequest) {
          this._storeInCache(cacheKey, parsedResponse);
        }

        return parsedResponse;
      } catch (error) {
        lastError = error;

        // Record failure if not retrying or on final attempt
        const shouldRetry = this._shouldRetry(error, attempt);
        if (!shouldRetry || attempt === this.retryConfig.maxRetries - 1) {
          this._recordFailure(error);
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
   * @example
   * const options = apiClient.createRequestOptions(apiKey, "POST", {
   *   "Custom-Header": "value"
   * });
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
   * Response Handling
   */

  /**
   * HTTP status code to error message mapping
   * @type {Object<number, string>}
   * @private
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

    this._updateRateLimitInfo(headers);

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
   * Rate Limit Management
   */

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
   * @private
   */
  _updateRateLimitInfo(headers) {
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

// Export singleton instance
const apiClient = new ApiClient();
