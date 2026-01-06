/**
 * Error handling configuration constants
 * @private
 */
const ERROR_CONFIG = {
  /**
   * User-friendly error messages mapped by error type
   * @type {Object<string|Function>}
   */
  MESSAGES: {
    DRIVE_PERMISSION:
      "Unable to access required files. The add-on needs Drive file access permissions to function properly.",
    INVALID_API_KEY:
      "Invalid API key. Please check your Hevy Developer Settings and reset your API key.",
    API_KEY_VALIDATION: "API key validation failed. Please reset your API key.",
    DEFAULT: (errorId) => `An error occurred. Reference ID: ${errorId}`,
  },

  /**
   * Error codes for structured error handling
   * @type {Object<string>}
   */
  CODES: {
    DRIVE_PERMISSION: "E_DRIVE_PERMISSION",
    INVALID_API_KEY: "E_INVALID_API_KEY",
    API_ERROR: "E_API_ERROR",
    VALIDATION_ERROR: "E_VALIDATION",
    CONFIGURATION_ERROR: "E_CONFIGURATION",
    SHEET_ERROR: "E_SHEET_ERROR",
    NETWORK_ERROR: "E_NETWORK",
    TIMEOUT_ERROR: "E_TIMEOUT",
    RATE_LIMIT_ERROR: "E_RATE_LIMIT",
    UNKNOWN_ERROR: "E_UNKNOWN",
  },

  /**
   * Recovery suggestions mapped by error code
   * @type {Object<string>}
   */
  RECOVERY_SUGGESTIONS: {
    E_DRIVE_PERMISSION:
      "To fix this:\n" +
      "1. Use any menu item in Extensions → Hevy Tracker (this will trigger re-authorization)\n" +
      "2. Or go to Extensions → Add-ons → Manage add-ons → Hevy Tracker → Options → Re-authorize\n" +
      "3. Ensure you have edit access to this spreadsheet\n" +
      "4. If the issue persists, try uninstalling and reinstalling the add-on",
    E_INVALID_API_KEY:
      "Go to Extensions > Hevy Tracker > Set API Key to update your API key.",
    E_API_ERROR: "The API request failed. Please try again in a few moments.",
    E_RATE_LIMIT_ERROR:
      "API rate limit reached. Please wait a few minutes before trying again.",
    E_NETWORK_ERROR: "Check your internet connection and try again.",
    E_TIMEOUT_ERROR:
      "The request timed out. Please try again with a smaller dataset.",
    E_VALIDATION_ERROR: "Please check your input and try again.",
    E_CONFIGURATION_ERROR: "Please check your configuration settings.",
  },
};

/**
 * Error handling class for consistent error management
 * @module error/ErrorHandler
 */
class ErrorHandler {
  /**
   * Handles errors consistently across the application with logging and user feedback
   * @param {Error} error - The error to handle
   * @param {string|Object} context - Context where the error occurred
   * @param {boolean} [showToast=true] - Whether to show a toast notification
   * @returns {Error} Enhanced error with ID, code, context, and recovery suggestions
   */
  static handle(error, context, showToast = true) {
    const errorId = Utilities.getUuid();
    const contextObj =
      typeof context === "string" ? { description: context } : context;
    const enhancedError = this.enhanceError(error, contextObj);
    const errorCode = this.getErrorCode(enhancedError);

    // Add error metadata
    Object.assign(enhancedError, {
      errorId,
      errorCode,
      timestamp: new Date().toISOString(),
      recoverySuggestion: this.getRecoverySuggestion(errorCode),
    });

    // Log error with structured data
    this._logError(errorId, enhancedError, contextObj, error);

    // Show user notification if requested
    if (showToast) {
      this._showErrorToast(enhancedError);
    }

    return enhancedError;
  }

  /**
   * Sanitizes objects for safe logging by removing sensitive data
   * @param {*} data - Data to sanitize (any type)
   * @param {Set} [visited] - Set of visited objects to prevent circular reference issues
   * @param {number} [depth=0] - Current recursion depth to prevent stack overflow
   * @returns {*} Sanitized data
   * @private
   */
  static _sanitizeForLogging(data, visited = new Set(), depth = 0) {
    // Prevent excessive recursion
    if (depth > 10) {
      return "[MAX_DEPTH_REACHED]";
    }

    // Handle primitives and null/undefined
    if (data === null || data === undefined) {
      return data;
    }

    if (
      typeof data !== "object" ||
      data instanceof Date ||
      data instanceof RegExp
    ) {
      return data;
    }

    // Handle circular references
    if (visited.has(data)) {
      return "[CIRCULAR_REFERENCE]";
    }

    visited.add(data);

    try {
      // Handle arrays
      if (Array.isArray(data)) {
        return data.map((item) =>
          this._sanitizeForLogging(item, visited, depth + 1)
        );
      }

      // Handle objects
      const sanitized = {};
      for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) {
          continue;
        }

        const lowerKey = key.toLowerCase();

        // Remove properties with sensitive names (case-insensitive)
        if (
          lowerKey.includes("api-key") ||
          lowerKey.includes("apikey") ||
          lowerKey === "api_key" ||
          lowerKey === "authorization" ||
          lowerKey === "auth"
        ) {
          sanitized[key] = "[REDACTED]";
          continue;
        }

        const value = data[key];

        // Special handling for headers objects
        if (key === "headers" && typeof value === "object" && value !== null) {
          const sanitizedHeaders = {};
          for (const headerKey in value) {
            if (!Object.prototype.hasOwnProperty.call(value, headerKey)) {
              continue;
            }
            const lowerHeaderKey = headerKey.toLowerCase();
            if (
              lowerHeaderKey === "api-key" ||
              lowerHeaderKey === "apikey" ||
              lowerHeaderKey === "authorization" ||
              lowerHeaderKey === "auth"
            ) {
              sanitizedHeaders[headerKey] = "[REDACTED]";
            } else {
              sanitizedHeaders[headerKey] = this._sanitizeForLogging(
                value[headerKey],
                visited,
                depth + 1
              );
            }
          }
          sanitized[key] = sanitizedHeaders;
        } else {
          // Recursively sanitize nested objects
          sanitized[key] = this._sanitizeForLogging(value, visited, depth + 1);
        }
      }

      return sanitized;
    } finally {
      visited.delete(data);
    }
  }

  /**
   * Logs error with structured information
   * @param {string} errorId - Unique error identifier
   * @param {Error} enhancedError - Enhanced error object
   * @param {Object} contextObj - Error context
   * @param {Error} originalError - Original error for stack trace
   * @private
   */
  static _logError(errorId, enhancedError, contextObj, originalError) {
    // Sanitize context and error objects to prevent API key exposure
    const sanitizedContext = this._sanitizeForLogging(contextObj);
    const sanitizedError = this._sanitizeForLogging({
      name: originalError?.name,
      message: originalError?.message,
      stack: originalError?.stack,
      statusCode: originalError?.statusCode,
      context: originalError?.context,
      options: originalError?.options,
      request: originalError?.request,
      response: originalError?.response,
    });

    console.error(`Error [${errorId}]:`, {
      errorCode: enhancedError.errorCode,
      message: enhancedError.message,
      context: sanitizedContext,
      recoverySuggestion: enhancedError.recoverySuggestion,
      stack: sanitizedError.stack,
      user: Session.getActiveUser().getEmail(),
      timestamp: enhancedError.timestamp,
      originalError: sanitizedError,
    });
  }

  /**
   * Shows error toast notification to user
   * @param {Error} error - Enhanced error object
   * @private
   */
  static _showErrorToast(error) {
    try {
      const userMessage = this.getUserMessage(error);
      getActiveSpreadsheet().toast(userMessage, "Error", TOAST_DURATION.NORMAL);
    } catch (uiError) {
      console.warn("ErrorHandler: Unable to show toast:", uiError);
    }
  }

  /**
   * Gets error code for structured error handling
   * @param {Error} error - The error to get code for
   * @returns {string} Error code
   * @private
   */
  static getErrorCode(error) {
    // Check custom error types first
    const errorTypeMap = new Map([
      [DrivePermissionError, ERROR_CONFIG.CODES.DRIVE_PERMISSION],
      [InvalidApiKeyError, ERROR_CONFIG.CODES.INVALID_API_KEY],
      [ValidationError, ERROR_CONFIG.CODES.VALIDATION_ERROR],
      [ConfigurationError, ERROR_CONFIG.CODES.CONFIGURATION_ERROR],
      [SheetError, ERROR_CONFIG.CODES.SHEET_ERROR],
      [ImportTimeoutError, ERROR_CONFIG.CODES.TIMEOUT_ERROR],
    ]);

    for (const [ErrorClass, code] of errorTypeMap) {
      if (error instanceof ErrorClass) {
        return code;
      }
    }

    // Handle ApiError with status-specific codes
    if (error instanceof ApiError) {
      const { statusCode } = error;
      if (statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
        return ERROR_CONFIG.CODES.RATE_LIMIT_ERROR;
      }
      if (
        statusCode === HTTP_STATUS.REQUEST_TIMEOUT ||
        statusCode === HTTP_STATUS.GATEWAY_TIMEOUT
      ) {
        return ERROR_CONFIG.CODES.TIMEOUT_ERROR;
      }
      return ERROR_CONFIG.CODES.API_ERROR;
    }

    // Check error message for network-related keywords
    if (this._isNetworkError(error)) {
      return ERROR_CONFIG.CODES.NETWORK_ERROR;
    }

    return ERROR_CONFIG.CODES.UNKNOWN_ERROR;
  }

  /**
   * Checks if error message indicates network-related issues
   * @param {Error} error - The error to check
   * @returns {boolean} True if network error
   * @private
   */
  static _isNetworkError(error) {
    const message = error?.message?.toLowerCase() ?? "";
    const networkKeywords = ["network", "dns", "connection"];
    return networkKeywords.some((keyword) => message.includes(keyword));
  }

  /**
   * Gets recovery suggestion for an error code
   * @param {string} errorCode - The error code
   * @returns {string} Recovery suggestion
   * @private
   */
  static getRecoverySuggestion(errorCode) {
    return (
      ERROR_CONFIG.RECOVERY_SUGGESTIONS[errorCode] ??
      "Please try again or contact support if the issue persists."
    );
  }

  /**
   * Enhances error with appropriate type and context
   * @param {Error} error - The error to enhance
   * @param {Object} context - Error context
   * @returns {Error} Enhanced error
   * @private
   */
  static enhanceError(error, context) {
    // Preserve existing custom error types with updated context
    if (this.isCustomErrorType(error)) {
      error.context = { ...(error.context ?? {}), ...context };
      return error;
    }

    // Enhance based on error characteristics
    if (this.isPermissionError(error)) {
      return new DrivePermissionError(
        ERROR_CONFIG.MESSAGES.DRIVE_PERMISSION,
        context
      );
    }

    if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
      return new InvalidApiKeyError(
        error.message ?? "Invalid or revoked API key"
      );
    }

    if (error.statusCode ?? context.endpoint) {
      return new ApiError(
        error.message ?? "API request failed",
        error.statusCode ?? 0,
        error.response,
        context
      );
    }

    if (context.sheetName) {
      return new SheetError(
        error.message ?? "Sheet operation failed",
        context.sheetName,
        context
      );
    }

    if (error instanceof TypeError || context.validation) {
      return new ValidationError(error.message ?? "Validation failed", context);
    }

    return error;
  }

  /**
   * Gets user-friendly error message
   * @param {Error} error - The error to get message for
   * @returns {string} User-friendly error message
   * @private
   */
  static getUserMessage(error) {
    if (error instanceof DrivePermissionError) {
      return ERROR_CONFIG.MESSAGES.DRIVE_PERMISSION;
    }

    if (error instanceof InvalidApiKeyError) {
      return ERROR_CONFIG.MESSAGES.INVALID_API_KEY;
    }

    if (
      error instanceof ApiError &&
      error.statusCode === HTTP_STATUS.UNAUTHORIZED
    ) {
      return ERROR_CONFIG.MESSAGES.API_KEY_VALIDATION;
    }

    return ERROR_CONFIG.MESSAGES.DEFAULT(error?.errorId ?? "unknown");
  }

  /**
   * Checks if error is already an enhanced type
   * @param {Error} error - The error to check
   * @returns {boolean} True if error is a custom type
   * @private
   */
  static isCustomErrorType(error) {
    return (
      error instanceof ApiError ||
      error instanceof ValidationError ||
      error instanceof ConfigurationError ||
      error instanceof SheetError ||
      error instanceof InvalidApiKeyError ||
      error instanceof ImportTimeoutError
    );
  }

  /**
   * Checks if error is a permission-related error
   * @param {Error} error - The error to check
   * @returns {boolean} True if error is permission-related
   * @private
   */
  static isPermissionError(error) {
    // Check for explicit Drive permission error flag
    if (error?.isDrivePermissionError === true) {
      return true;
    }

    const message = error?.message?.toLowerCase() ?? "";
    if (!message) {
      return false;
    }

    // Avoid misclassifying UI scope issues as Drive permission problems.
    // These are handled separately in UiUtils with a dedicated alert.
    const uiPermissionIndicators = [
      "ui.showmodaldialog",
      "ui.showsidebar",
      "script.container.ui",
    ];
    if (uiPermissionIndicators.some((keyword) => message.includes(keyword))) {
      return false;
    }

    // Strong indicators of Drive/file access issues
    const fileDriveKeywords = [
      "unable to access file",
      "file not found",
      "cannot find file",
      "drive",
      "driveapp",
    ];
    if (fileDriveKeywords.some((keyword) => message.includes(keyword))) {
      return true;
    }

    // Generic permission phrases, but only treat as Drive-related when
    // combined with file-like terminology.
    const genericPermissionKeywords = [
      "access denied",
      "insufficient permissions",
    ];
    const fileContextKeywords = ["file", "document", "spreadsheet"];

    return (
      genericPermissionKeywords.some((keyword) => message.includes(keyword)) &&
      fileContextKeywords.some((keyword) => message.includes(keyword))
    );
  }
}

// Error Types
class ValidationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ValidationError";
    this.context = context;
  }
}

class ApiError extends Error {
  constructor(message, statusCode, response, context = {}) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.response = response;
    this.context = context;
  }

  isRetryable() {
    const retryableStatusCodes = [
      HTTP_STATUS.REQUEST_TIMEOUT,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      HTTP_STATUS.GATEWAY_TIMEOUT,
    ];
    return retryableStatusCodes.includes(this.statusCode);
  }
}

class ConfigurationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.context = context;
  }
}

class SheetError extends Error {
  constructor(message, sheetName, context = {}) {
    super(message);
    this.name = "SheetError";
    this.sheetName = sheetName;
    this.context = { ...context, sheetName };
  }
}

class InvalidApiKeyError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "InvalidApiKeyError";
    this.context = context;
  }
}

class DrivePermissionError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "DrivePermissionError";
    this.context = context;
  }
}

class ImportTimeoutError extends Error {
  constructor(message = "Import operation timed out", context = {}) {
    super(message);
    this.name = "ImportTimeoutError";
    this.context = context;
  }
}
