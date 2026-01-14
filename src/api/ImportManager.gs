/**
 * Manages import orchestration, progress tracking, and trigger management.
 * @class ImportManager
 */
class ImportManager {
  constructor(apiClient, apiKeyManager) {
    this.apiClient = apiClient;
    this.apiKeyManager = apiKeyManager;
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
   */
  async executeImportStep(stepName, importFn, completedSteps, checkTimeout) {
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
   * await importManager.fetchPaginatedData(
   *   API_ENDPOINTS.WORKOUTS,
   *   PAGE_SIZE.WORKOUTS,
   *   async (workouts) => { /* process workouts *\/ },
   *   "workouts"
   * );
   */
  /**
   * Builds request objects for parallel page fetching
   * @param {number} startPage - Starting page number
   * @param {number} concurrency - Number of pages to fetch
   * @param {string} endpoint - API endpoint
   * @param {number} pageSize - Page size
   * @param {string} apiKey - API key
   * @param {Object} additionalParams - Additional query parameters
   * @returns {Array<{requests: Array, pageNumbers: Array, nextPage: number}>}
   * @private
   */
  _buildParallelRequests(
    startPage,
    concurrency,
    endpoint,
    pageSize,
    apiKey,
    additionalParams
  ) {
    const requests = [];
    const pageNumbers = [];
    let currentPage = startPage;

    for (let i = 0; i < concurrency && currentPage <= MAX_PAGES; i++) {
      const queryParams = {
        page: currentPage,
        page_size: pageSize,
        ...additionalParams,
      };

      const url = this.apiClient.buildUrl(endpoint, queryParams);
      const requestOptions = this.apiClient.createRequestOptions(apiKey);

      requests.push({
        url: url,
        ...requestOptions,
      });
      pageNumbers.push(currentPage);
      currentPage++;
    }

    return { requests, pageNumbers, nextPage: currentPage };
  }

  /**
   * Processes a single response from parallel fetch
   * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - HTTP response
   * @param {number} pageNum - Page number
   * @param {string} dataKey - Key in response containing data
   * @param {Function} processFn - Function to process data
   * @param {number} pageSize - Page size
   * @returns {Promise<{processedCount: number, hasMore: boolean}>}
   * @private
   */
  async _processParallelResponse(
    response,
    pageNum,
    dataKey,
    processFn,
    pageSize
  ) {
    const statusCode = response.getResponseCode();
    QuotaTracker.recordUrlFetch(1);

    const headers = response.getHeaders();
    this.apiClient.rateLimitManager.updateRateLimitInfo(headers);

    if (
      statusCode < HTTP_STATUS_RANGE.SUCCESS_START ||
      statusCode > HTTP_STATUS_RANGE.SUCCESS_END
    ) {
      return { processedCount: 0, hasMore: false, statusCode };
    }

    const responseText = response.getContentText();
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (error) {
      throw ErrorHandler.handle(
        new ApiError(
          "Invalid JSON response from API",
          statusCode,
          responseText
        ),
        { operation: "Parsing API response", page: pageNum }
      );
    }

    const result = await this.processPageData(
      parsedResponse,
      dataKey,
      processFn,
      pageSize,
      pageNum
    );

    return { ...result, statusCode };
  }

  /**
   * Applies adaptive rate limiting delay based on remaining requests
   * @private
   */
  _applyAdaptiveRateLimit() {
    const rateLimitInfo = this.apiClient.rateLimitManager.getRateLimitInfo();
    if (
      !rateLimitInfo ||
      rateLimitInfo.remaining === null ||
      rateLimitInfo.limit === null
    ) {
      return;
    }

    const remainingPercent = rateLimitInfo.remaining / rateLimitInfo.limit;
    const LOW_THRESHOLD_PERCENT = 0.2;
    const LOW_THRESHOLD_COUNT = 50;

    if (
      remainingPercent < LOW_THRESHOLD_PERCENT ||
      rateLimitInfo.remaining < LOW_THRESHOLD_COUNT
    ) {
      Utilities.sleep(100);
    }
  }

  async fetchPaginatedData(
    endpoint,
    pageSize,
    processFn,
    dataKey,
    additionalParams = {},
    checkTimeout = null
  ) {
    const apiKey = this.apiKeyManager.getOrPromptApiKey();
    if (!apiKey) return 0;

    let page = 1;
    let totalProcessed = 0;
    let hasMore = true;
    const concurrency = RATE_LIMIT.PARALLEL_PAGE_CONCURRENCY;

    while (hasMore && page <= MAX_PAGES) {
      try {
        if (checkTimeout && checkTimeout()) {
          throw new ImportTimeoutError(
            `Timeout approaching while fetching ${endpoint} (page ${page})`
          );
        }

        const { requests, pageNumbers, nextPage } = this._buildParallelRequests(
          page,
          concurrency,
          endpoint,
          pageSize,
          apiKey,
          additionalParams
        );

        if (requests.length === 0) {
          break;
        }

        const responses = UrlFetchApp.fetchAll(requests);
        let batchHasMore = true;

        for (let i = 0; i < responses.length; i++) {
          const response = responses[i];
          const pageNum = pageNumbers[i];
          const statusCode = response.getResponseCode();

          if (statusCode === HTTP_STATUS.NOT_FOUND) {
            batchHasMore = false;
            break;
          }

          if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
            Utilities.sleep(1000);
            const retryResponse = await this.fetchPage(
              endpoint,
              apiKey,
              pageNum,
              pageSize,
              additionalParams
            );
            const result = await this.processPageData(
              retryResponse,
              dataKey,
              processFn,
              pageSize,
              pageNum
            );
            totalProcessed += result.processedCount;
            if (!result.hasMore) {
              batchHasMore = false;
              break;
            }
            continue;
          }

          const result = await this._processParallelResponse(
            response,
            pageNum,
            dataKey,
            processFn,
            pageSize
          );

          if (
            result.statusCode < HTTP_STATUS_RANGE.SUCCESS_START ||
            result.statusCode > HTTP_STATUS_RANGE.SUCCESS_END
          ) {
            throw ErrorHandler.handle(
              new ApiError(
                `API request failed with status ${result.statusCode}`,
                result.statusCode,
                response.getContentText()
              ),
              {
                endpoint,
                page: pageNum,
                operation: "Fetching paginated data",
              }
            );
          }

          totalProcessed += result.processedCount;

          if (!result.hasMore) {
            batchHasMore = false;
            break;
          }
        }

        page = nextPage;
        hasMore = batchHasMore;

        if (hasMore) {
          this._applyAdaptiveRateLimit();
        }
      } catch (error) {
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

  /**
   * Fetches a single page of data
   * @param {string} endpoint - API endpoint
   * @param {string} apiKey - API key
   * @param {number} page - Page number
   * @param {number} pageSize - Page size
   * @param {Object} additionalParams - Additional query parameters
   * @returns {Promise<Object>} API response
   */
  async fetchPage(endpoint, apiKey, page, pageSize, additionalParams) {
    const queryParams = {
      page,
      page_size: pageSize,
      ...additionalParams,
    };

    return await this.apiClient.makeRequest(
      endpoint,
      this.apiClient.createRequestOptions(apiKey),
      queryParams
    );
  }

  /**
   * Process page data and determines if more pages exist
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
   * Ensures the automatic import trigger exists
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The spreadsheet
   */
  ensureImportTrigger(ss) {
    const spreadsheetId = ss.getId();
    const triggers = ScriptApp.getProjectTriggers();
    const exists = triggers.some(
      (t) =>
        t.getHandlerFunction() === "runAutomaticImport" &&
        t.getEventType() === ScriptApp.EventType.ON_OPEN &&
        t.getTriggerSourceId() === spreadsheetId
    );

    if (!exists) {
      ScriptApp.newTrigger("runAutomaticImport")
        .forSpreadsheet(ss)
        .onOpen()
        .create();
    }
  }

  /**
   * Cancels any pending runInitialImport triggers
   * Called when a manual import starts to prevent duplicate imports
   */
  cancelPendingInitialImportTriggers() {
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
   */
  setupAuthorizedWeightImport() {
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
      const apiKey =
        apiKeyOverride ?? this.apiKeyManager.getApiKeyFromProperties();
      if (!apiKey) {
        showInitialSetup();
        return;
      }

      // Mark import as active and cancel any pending triggers
      // Only reaches here if API key validation passed
      ImportProgressTracker.markImportActive();
      this.cancelPendingInitialImportTriggers();

      const ss = getActiveSpreadsheet();
      this.ensureImportTrigger(ss);

      if (checkForMultiLoginIssues()) {
        this._showToast(
          "Multi-login warning shown. Continuing with import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
      }

      if (apiKey === AUTHORIZED_API_KEY) {
        this.setupAuthorizedWeightImport();
      }

      // Check for existing progress and prompt user
      const existingProgress = ImportProgressTracker.loadProgress();
      if (existingProgress?.completedSteps?.length > 0) {
        if (skipResumeDialog) {
          // Skip dialog and automatically resume when called from continueImport dialog
          completedSteps = existingProgress.completedSteps;
          this._showToast(
            `Resuming import. Skipping ${completedSteps.length} completed step(s)...`,
            "Resuming Import",
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

        // Update heartbeat if needed (every IMPORT_CONFIG.HEARTBEAT_MS)
        if (now - lastHeartbeat >= IMPORT_CONFIG.HEARTBEAT_MS) {
          ImportProgressTracker.updateImportActiveHeartbeat();
          lastHeartbeat = now;
        }

        if (elapsed > IMPORT_CONFIG.MAX_EXECUTION_TIME_MS) {
          ImportProgressTracker.saveProgress(completedSteps);
          // Show dialog if there's progress to resume, otherwise show toast
          if (completedSteps.length > 0) {
            showContinueImportDialog();
          } else {
            this._showToast(
              "Import paused due to time limit. Run 'Import All' again to resume.",
              "Import Paused",
              TOAST_DURATION.LONG
            );
          }
          return true;
        }
        return false;
      };

      // Import Exercises, Routine Folders, and Routines concurrently
      // These are independent operations that can run in parallel
      if (!isTemplate) {
        // Run exercises, routine folders, and routines concurrently
        await Promise.all([
          this.executeImportStep(
            "exercises",
            () => importAllExercises(checkTimeout),
            completedSteps,
            checkTimeout
          ),
          this.executeImportStep(
            "routineFolders",
            () => importAllRoutineFolders(checkTimeout),
            completedSteps,
            checkTimeout
          ),
          this.executeImportStep(
            "routines",
            () => importAllRoutines(checkTimeout),
            completedSteps,
            checkTimeout
          ),
        ]);

        // Import Workouts after exercises (for localized exercise name mapping)
        await this.executeImportStep(
          "workouts",
          () => importAllWorkouts(checkTimeout),
          completedSteps,
          checkTimeout
        );
      } else {
        // Template mode: only import exercises
        await this.executeImportStep(
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

      this.apiKeyManager.resetApiKeyCheckInProgress();

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
        // Show dialog if there's progress to resume, otherwise show toast
        if (completedSteps.length > 0) {
          showContinueImportDialog();
        } else {
          this._showToast(
            "Import paused due to time limit. Run 'Import All' again to resume.",
            "Import Paused",
            TOAST_DURATION.LONG
          );
        }
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

      // For other errors, show dialog if there's progress to resume
      if (completedSteps.length > 0) {
        showContinueImportDialog();
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
}
