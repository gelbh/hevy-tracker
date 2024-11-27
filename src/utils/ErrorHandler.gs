class ErrorHandler {
  /**
   * Handles errors consistently across the application with logging and user feedback
   * @param {Error} error - The error to handle
   * @param {string|Object} context - Context where the error occurred
   * @param {boolean} [showToast=true] - Whether to show a toast notification
   * @throws {Error} Enhanced error with ID and context
   */
  static handle(error, context, showToast = true) {
    const errorId = Utilities.getUuid();
    const contextObj =
      typeof context === "string" ? { description: context } : context;

    // Enhance error with standard properties
    let enhancedError = this.enhanceError(error, contextObj);
    enhancedError.errorId = errorId;

    // Log the error
    console.error(`Error [${errorId}]:`, {
      message: enhancedError.message,
      context: contextObj,
      stack: error.stack,
      user: Session.getActiveUser().getEmail(),
    });

    // Show user feedback if requested
    if (showToast) {
      const userMessage = this.getUserMessage(enhancedError);
      SpreadsheetApp.getActiveSpreadsheet().toast(
        userMessage,
        "Error",
        TOAST_DURATION.NORMAL
      );
    }

    return enhancedError;
  }

  /**
   * Enhances error with appropriate type and context
   * @private
   */
  static enhanceError(error, context) {
    if (this.isEnhancedErrorType(error)) {
      error.context = { ...error.context, ...context };
      return error;
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
   * @private
   */
  static getUserMessage(error) {
    if (error instanceof InvalidApiKeyError) {
      return "Invalid API key. Please check your Hevy Developer Settings and reset your API key.";
    }

    if (error instanceof ApiError && error.statusCode === 401) {
      return "API key validation failed. Please reset your API key.";
    }

    return DEBUG_MODE
      ? `Error: ${error.message}\nID: ${error.errorId}`
      : `An error occurred. Reference ID: ${error.errorId}`;
  }

  /**
   * Checks if error is already an enhanced type
   * @private
   */
  static isEnhancedErrorType(error) {
    return (
      error instanceof ApiError ||
      error instanceof ValidationError ||
      error instanceof ConfigurationError ||
      error instanceof SheetError ||
      error instanceof InvalidApiKeyError
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
