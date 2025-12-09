/**
 * Error serialization and async error boundary utilities
 * @module error/ErrorUtils
 */

/**
 * Custom error type names that need serialization for HTML service
 * @type {Set<string>}
 * @private
 */
const CUSTOM_ERROR_TYPES = new Set([
  "InvalidApiKeyError",
  "ApiError",
  "ValidationError",
  "ConfigurationError",
  "SheetError",
  "DrivePermissionError",
]);

/**
 * Serializes error for HTML service compatibility
 * HTML service can only serialize plain Error objects with message strings
 * @param {Error} error - The error to serialize
 * @returns {Error} Serialized error with message string
 */
function serializeErrorForHtml(error) {
  if (!error) {
    return new Error("Unknown error");
  }

  // Handle custom error types
  if (
    error.name &&
    typeof error.message === "string" &&
    CUSTOM_ERROR_TYPES.has(error.name)
  ) {
    const plainError = new Error(error.message);
    plainError.name = error.name;
    return plainError;
  }

  // Return as-is if already a plain Error
  if (error instanceof Error) {
    return error;
  }

  // Convert any other type to Error
  return new Error(String(error));
}

/**
 * Wraps an async function with error boundary to prevent error propagation
 * @template T
 * @param {() => Promise<T>} asyncFn - Async function to wrap
 * @param {string|Object} context - Error context
 * @param {T} [defaultValue] - Default value to return on error
 * @returns {Promise<T>} Result of async function or default value on error
 */
async function withErrorBoundary(asyncFn, context, defaultValue = null) {
  try {
    return await asyncFn();
  } catch (error) {
    ErrorHandler.handle(error, context, false);
    return defaultValue;
  }
}

/**
 * Executes multiple async operations with error aggregation
 * Continues even if some operations fail
 * @template T
 * @param {Array<() => Promise<T>>} asyncFns - Array of async functions to execute
 * @param {string|Object} context - Error context
 * @returns {Promise<Array<{success: boolean, result?: T, error?: Error}>>} Results with success status
 */
async function executeWithErrorAggregation(asyncFns, context) {
  const results = await Promise.allSettled(asyncFns.map((fn) => fn()));

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return { success: true, result: result.value };
    }

    const errorContext =
      typeof context === "string"
        ? { description: context, operationIndex: index }
        : { ...context, operationIndex: index };
    ErrorHandler.handle(result.reason, errorContext, false);
    return { success: false, error: result.reason };
  });
}
