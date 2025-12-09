/**
 * Manages API key storage, validation, and user interactions.
 * @class ApiKeyManager
 */
class ApiKeyManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this._apiKeyCheckInProgress = false;
  }

  /**
   * Gets API key from document properties
   * @returns {string|null} API key or null if not found
   */
  getApiKeyFromProperties() {
    const properties = getDocumentProperties();
    return properties?.getProperty("HEVY_API_KEY") ?? null;
  }

  /**
   * Gets API key or prompts user to set one if not found
   * @returns {string|null} API key or null if not available
   */
  getOrPromptApiKey() {
    const key = this.getApiKeyFromProperties();
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
      const currentKey = this.getApiKeyFromProperties();
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
   */
  handleInvalidApiKey(error) {
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
   * Shows a prompt to set or reset the API key
   * @param {string} message - Prompt message
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
   * @returns {boolean} True if user confirms reset
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
   */
  async validateApiKey(apiKey) {
    const url = `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`;
    // Use shorter timeout for validation since it's just a quick check
    const config = this.apiClient._getApiClientConfig();
    const options = {
      ...this.apiClient.createRequestOptions(apiKey),
      timeout: config.VALIDATION_TIMEOUT_MS,
    };

    try {
      const response = await this.apiClient.executeRequest(url, options);

      if (response.getResponseCode() === HTTP_STATUS.UNAUTHORIZED) {
        throw ErrorHandler.handle(
          new InvalidApiKeyError("Invalid or revoked API key"),
          { operation: "Validating API key" },
          false // Don't show toast during validation
        );
      }

      return true;
    } catch (error) {
      if (this.apiClient._isNetworkError(error)) {
        throw new Error(
          "Request timed out. Please check your internet connection and try again."
        );
      }
      throw error;
    }
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
   * Resets the API key check in progress flag
   */
  resetApiKeyCheckInProgress() {
    this._apiKeyCheckInProgress = false;
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
}
