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
  const enhancedError = enhanceError(error, context);

  Logger.error(`Error [${errorId}]: ${enhancedError.message}`, {
    context,
    function: getCaller(),
    user: Session.getActiveUser().getEmail(),
    originalError: error,
    ...enhancedError.context,
  });

  if (showToast) {
    const userMessage = getUserMessage(enhancedError, errorId);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      userMessage,
      "Error",
      TOAST_DURATION.NORMAL
    );
  }

  enhancedError.errorId = errorId;
  throw enhancedError;
}

/**
 * Gets user-friendly error message based on error type
 * @private
 */
function getUserMessage(error, errorId) {
  if (error instanceof InvalidApiKeyError) {
    return "Invalid API key. Please check your Hevy Developer Settings and reset your API key.";
  }

  if (error instanceof ApiError && error.statusCode === 401) {
    return "API key validation failed. Please reset your API key.";
  }

  return DEBUG_MODE
    ? `Error: ${error.message}\nID: ${errorId}`
    : `An error occurred. Reference ID: ${errorId}`;
}

/**
 * Gets the name of the calling function from the stack trace
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

/**
 * Enhances an error with additional context and type information
 * @private
 */
function enhanceError(error, context) {
  const contextObj =
    typeof context === "string" ? { description: context } : context;

  // Return if already an enhanced error type
  if (isEnhancedError(error)) {
    error.context = { ...error.context, ...contextObj };
    return error;
  }

  // Convert to specific error types based on characteristics
  if (error.statusCode === 401) {
    return new InvalidApiKeyError(
      error.message || "Invalid or revoked API key",
      contextObj
    );
  }

  if (error.statusCode || contextObj.endpoint) {
    return new ApiError(
      error.message || "API request failed",
      error.statusCode || 0,
      error.response || null,
      contextObj
    );
  }

  if (contextObj.sheetName) {
    return new SheetError(
      error.message || "Sheet operation failed",
      contextObj.sheetName,
      contextObj
    );
  }

  if (error instanceof TypeError || contextObj.validation) {
    return new ValidationError(
      error.message || "Validation failed",
      contextObj
    );
  }

  // Default to keeping original error with added context
  error.context = contextObj;
  return error;
}

/**
 * Checks if an error is already an enhanced error type
 * @private
 */
function isEnhancedError(error) {
  return (
    error instanceof ApiError ||
    error instanceof ValidationError ||
    error instanceof ConfigurationError ||
    error instanceof SheetError ||
    error instanceof InvalidApiKeyError
  );
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
