/**
 * Centralized error handling system for consistent error management across the application
 */

/**
 * Enhanced error handler with logging and user feedback
 * @param {Error} error - The error to handle
 * @param {string} context - Context where the error occurred
 * @param {boolean} [showToast=true] - Whether to show a toast notification
 * @throws {Error} Enhanced error with ID
 */
function handleError(error, context, showToast = true) {
  const errorId = Utilities.getUuid();
  
  const enhancedError = enhanceError(error, context);
  
  Logger.error(
    `Error [${errorId}]: ${enhancedError.message}`,
    {
      context,
      function: getCaller(),
      user: Session.getActiveUser().getEmail(),
      originalError: error,
      ...enhancedError.context
    }
  );
  
  if (showToast) {
    const userMessage = DEBUG_MODE ?
      `Error: ${enhancedError.message}\nID: ${errorId}` :
      `An error occurred. Reference ID: ${errorId}`;
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      userMessage,
      'Error',
      TOAST_DURATION.NORMAL
    );
  }
  
  // Attach errorId to the enhanced error
  enhancedError.errorId = errorId;
  throw enhancedError;
}

/**
 * Gets the name of the calling function from the stack trace
 * @returns {string} Name of the calling function
 */
function getCaller() {
  try {
    const stack = new Error().stack;
    const caller = stack.split('\n')[3];
    const match = caller.match(/at (.+?) /);
    return match ? match[1] : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Enhances an error with additional context and type information
 * @param {Error} error - Original error
 * @param {string|Object} context - Error context or context description
 * @returns {Error} Enhanced error with proper type and context
 */
function enhanceError(error, context) {
  const contextObj = typeof context === 'string' ? { description: context } : context;

  if (error instanceof ApiError || 
      error instanceof ValidationError || 
      error instanceof ConfigurationError || 
      error instanceof SheetError) {
    error.context = { ...error.context, ...contextObj };
    return error;
  }

  // Convert generic errors to specific types based on their properties and context
  if (error.statusCode || contextObj.endpoint) {
    return new ApiError(
      error.message || 'API request failed',
      error.statusCode || 0,
      error.response || null,
      contextObj
    );
  }

  if (contextObj.sheetName) {
    return new SheetError(
      error.message || 'Sheet operation failed',
      contextObj.sheetName,
      contextObj
    );
  }

  if (error instanceof TypeError || contextObj.validation) {
    return new ValidationError(
      error.message || 'Validation failed',
      contextObj
    );
  }

  // Default to keeping the original error type but with enhanced context
  error.context = contextObj;
  return error;
}

// Custom error types with enhanced context support

/**
 * Error type for validation failures
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} [context={}] - Additional error context
   */
  constructor(message, context = {}) {
    super(message);
    this.name = 'ValidationError';
    this.context = context;
  }
}

/**
 * Error type for API-related failures
 */
class ApiError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {string|null} response - Raw API response
   * @param {Object} [context={}] - Additional error context
   */
  constructor(message, statusCode, response, context = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.response = response;
    this.context = context;
  }

  /**
   * Checks if the error represents a specific HTTP status code
   * @param {number} code - HTTP status code to check
   * @returns {boolean} True if the error matches the status code
   */
  isStatus(code) {
    return this.statusCode === code;
  }

  /**
   * Checks if the error should trigger a retry
   * @returns {boolean} True if the error is retryable
   */
  isRetryable() {
    const retryableCodes = [408, 429, 500, 502, 503, 504];
    return retryableCodes.includes(this.statusCode);
  }
}

/**
 * Error type for configuration-related failures
 */
class ConfigurationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} [context={}] - Additional error context
   */
  constructor(message, context = {}) {
    super(message);
    this.name = 'ConfigurationError';
    this.context = context;
  }
}

/**
 * Error type for spreadsheet operation failures
 */
class SheetError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} sheetName - Name of the sheet where the error occurred
   * @param {Object} [context={}] - Additional error context
   */
  constructor(message, sheetName, context = {}) {
    super(message);
    this.name = 'SheetError';
    this.sheetName = sheetName;
    this.context = { ...context, sheetName };
  }
}