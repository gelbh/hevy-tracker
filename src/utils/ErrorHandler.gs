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

class ErrorHandler {
  /**
   * Handles errors consistently across the application with logging and user feedback
   * @param {Error} error - The error to handle
   * @param {string|Object} context - Context where the error occurred
   * @param {boolean} [showToast=true] - Whether to show a toast notification
   * @returns {Error} Enhanced error with ID and context
   */
  static handle(error, context, showToast = true) {
    const errorId = Utilities.getUuid();
    const contextObj =
      typeof context === "string" ? { description: context } : context;
    const enhancedError = this.enhanceError(error, contextObj);
    enhancedError.errorId = errorId;

    console.error(`Error [${errorId}]:`, {
      message: enhancedError.message,
      context: contextObj,
      stack: error.stack,
      user: Session.getActiveUser().getEmail(),
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

    if (error.statusCode === 401) {
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

    if (error instanceof ApiError && error.statusCode === 401) {
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
    return [408, 429, 500, 502, 503, 504].includes(this.statusCode);
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
