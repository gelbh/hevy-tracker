/**
 * Centralized error handling system for consistent error management across the application
 */

/**
 * Enhanced error handler with logging and user feedback
 * @param {Error} error - The error to handle
 * @param {string|Object} context - Context where the error occurred
 * @param {boolean} [showToast=true] - Whether to show a toast notification
 * @throws {Error} Enhanced error with ID
 */
function handleError(error, context, showToast = true) {
  const errorId = Utilities.getUuid();
  const contextObj =
    typeof context === "string" ? { description: context } : context;

  // Enhance the error with additional context
  let enhancedError = error;

  // Only enhance if not already an enhanced error type
  if (!isEnhancedErrorType(error)) {
    if (error.statusCode === 401) {
      enhancedError = new InvalidApiKeyError(
        error.message || "Invalid or revoked API key"
      );
    } else if (error.statusCode || contextObj.endpoint) {
      enhancedError = new ApiError(
        error.message || "API request failed",
        error.statusCode || 0,
        error.response
      );
    } else if (contextObj.sheetName) {
      enhancedError = new SheetError(
        error.message || "Sheet operation failed",
        contextObj.sheetName
      );
    } else if (error instanceof TypeError || contextObj.validation) {
      enhancedError = new ValidationError(error.message || "Validation failed");
    }
  }

  // Add context and ID to the enhanced error
  enhancedError.context = contextObj;
  enhancedError.errorId = errorId;

  // Log the error
  Logger.error(`Error [${errorId}]: ${enhancedError.message}`, {
    context: contextObj,
    function: getCaller(),
    user: Session.getActiveUser().getEmail(),
    originalError: error,
    stack: error.stack,
  });

  // Show user feedback if requested
  if (showToast) {
    const userMessage = getUserMessage(enhancedError);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      userMessage,
      "Error",
      TOAST_DURATION.NORMAL
    );
  }

  return enhancedError;
}

/**
 * Checks if an error is already an enhanced type
 * @private
 */
function isEnhancedErrorType(error) {
  return (
    error instanceof ApiError ||
    error instanceof ValidationError ||
    error instanceof ConfigurationError ||
    error instanceof SheetError ||
    error instanceof InvalidApiKeyError
  );
}

/**
 * Gets user-friendly error message
 * @private
 */
function getUserMessage(error) {
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
 * Gets the name of the calling function
 * @private
 */
function getCaller() {
  try {
    const stack = new Error().stack;
    const caller = stack.split("\n")[3];
    const match = caller.match(/at (.+?) /);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

// Custom error types
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

  isStatus(code) {
    return this.statusCode === code;
  }

  isRetryable() {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(this.statusCode);
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
