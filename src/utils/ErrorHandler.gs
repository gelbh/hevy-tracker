/**
 * User-friendly error messages mapped by error type
 * @type {Object<string>}
 * @private
 */
const ERROR_MESSAGES = {
  DRIVE_PERMISSION:
    "Unable to access file. Please ensure you have permission and try again.",
  INVALID_API_KEY:
    "Invalid API key. Please check your Hevy Developer Settings and reset your API key.",
  API_KEY_VALIDATION: "API key validation failed. Please reset your API key.",
  DEFAULT: (errorId) => `An error occurred. Reference ID: ${errorId}`,
};

/**
 * Error codes for structured error handling
 * @type {Object<string>}
 * @private
 */
const ERROR_CODES = {
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
};

/**
 * Recovery suggestions for different error types
 * @type {Object<string>}
 * @private
 */
const RECOVERY_SUGGESTIONS = {
  [ERROR_CODES.DRIVE_PERMISSION]:
    "Check file permissions and ensure you have edit access.",
  [ERROR_CODES.INVALID_API_KEY]:
    "Go to Extensions > Hevy Tracker > Set API Key to update your API key.",
  [ERROR_CODES.API_ERROR]:
    "The API request failed. Please try again in a few moments.",
  [ERROR_CODES.RATE_LIMIT_ERROR]:
    "API rate limit reached. Please wait a few minutes before trying again.",
  [ERROR_CODES.NETWORK_ERROR]: "Check your internet connection and try again.",
  [ERROR_CODES.TIMEOUT_ERROR]:
    "The request timed out. Please try again with a smaller dataset.",
  [ERROR_CODES.VALIDATION_ERROR]: "Please check your input and try again.",
  [ERROR_CODES.CONFIGURATION_ERROR]:
    "Please check your configuration settings.",
};

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
    enhancedError.errorId = errorId;
    enhancedError.errorCode = this.getErrorCode(enhancedError);
    enhancedError.recoverySuggestion = this.getRecoverySuggestion(
      enhancedError.errorCode
    );
    enhancedError.timestamp = new Date().toISOString();

    console.error(`Error [${errorId}]:`, {
      errorCode: enhancedError.errorCode,
      message: enhancedError.message,
      context: contextObj,
      recoverySuggestion: enhancedError.recoverySuggestion,
      stack: error.stack,
      user: Session.getActiveUser().getEmail(),
      timestamp: enhancedError.timestamp,
    });

    if (showToast) {
      try {
        const userMessage = this.getUserMessage(enhancedError);
        SpreadsheetApp.getActiveSpreadsheet().toast(
          userMessage,
          "Error",
          TOAST_DURATION.NORMAL
        );
      } catch (uiError) {
        console.warn("ErrorHandler: Unable to show toast:", uiError);
      }
    }

    return enhancedError;
  }

  /**
   * Gets error code for structured error handling
   * @param {Error} error - The error to get code for
   * @returns {string} Error code
   * @private
   */
  static getErrorCode(error) {
    if (error instanceof DrivePermissionError) {
      return ERROR_CODES.DRIVE_PERMISSION;
    }
    if (error instanceof InvalidApiKeyError) {
      return ERROR_CODES.INVALID_API_KEY;
    }
    if (error instanceof ApiError) {
      if (error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS) {
        return ERROR_CODES.RATE_LIMIT_ERROR;
      }
      if (
        error.statusCode === HTTP_STATUS.REQUEST_TIMEOUT ||
        error.statusCode === HTTP_STATUS.GATEWAY_TIMEOUT
      ) {
        return ERROR_CODES.TIMEOUT_ERROR;
      }
      return ERROR_CODES.API_ERROR;
    }
    if (error instanceof ValidationError) {
      return ERROR_CODES.VALIDATION_ERROR;
    }
    if (error instanceof ConfigurationError) {
      return ERROR_CODES.CONFIGURATION_ERROR;
    }
    if (error instanceof SheetError) {
      return ERROR_CODES.SHEET_ERROR;
    }
    if (
      error.message &&
      (error.message.includes("network") ||
        error.message.includes("DNS") ||
        error.message.includes("connection"))
    ) {
      return ERROR_CODES.NETWORK_ERROR;
    }
    return ERROR_CODES.UNKNOWN_ERROR;
  }

  /**
   * Gets recovery suggestion for an error code
   * @param {string} errorCode - The error code
   * @returns {string} Recovery suggestion
   * @private
   */
  static getRecoverySuggestion(errorCode) {
    return (
      RECOVERY_SUGGESTIONS[errorCode] ||
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
    if (this.isCustomErrorType(error)) {
      error.context = { ...error.context, ...context };
      return error;
    }

    if (this.isPermissionError(error)) {
      return new DrivePermissionError(
        "Unable to access file. This may be due to permission restrictions.",
        context
      );
    }

    if (error.statusCode === HTTP_STATUS.UNAUTHORIZED) {
      return new InvalidApiKeyError(
        error.message || "Invalid or revoked API key"
      );
    }

    if (error.statusCode || context.endpoint) {
      return new ApiError(
        error.message || "API request failed",
        error.statusCode || 0,
        error.response
      );
    }

    if (context.sheetName) {
      return new SheetError(
        error.message || "Sheet operation failed",
        context.sheetName
      );
    }

    if (error instanceof TypeError || context.validation) {
      return new ValidationError(error.message || "Validation failed");
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
      return ERROR_MESSAGES.DRIVE_PERMISSION;
    }

    if (error instanceof InvalidApiKeyError) {
      return ERROR_MESSAGES.INVALID_API_KEY;
    }

    if (
      error instanceof ApiError &&
      error.statusCode === HTTP_STATUS.UNAUTHORIZED
    ) {
      return ERROR_MESSAGES.API_KEY_VALIDATION;
    }

    return ERROR_MESSAGES.DEFAULT(error.errorId);
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
      error instanceof InvalidApiKeyError
    );
  }

  /**
   * Checks if error is a permission-related error
   * @param {Error} error - The error to check
   * @returns {boolean} True if error is permission-related
   * @private
   */
  static isPermissionError(error) {
    const message = error.message || "";
    return (
      message.includes("Access denied") ||
      message.includes("Insufficient permissions")
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
    return [
      HTTP_STATUS.REQUEST_TIMEOUT,
      HTTP_STATUS.TOO_MANY_REQUESTS,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      HTTP_STATUS.BAD_GATEWAY,
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      HTTP_STATUS.GATEWAY_TIMEOUT,
    ].includes(this.statusCode);
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
