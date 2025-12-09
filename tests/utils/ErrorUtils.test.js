/**
 * Tests for ErrorUtils.gs - Error serialization and async error boundary utilities
 */

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context, showToast) => error),
};

global.ErrorHandler = mockErrorHandler;

// Mock error classes
class InvalidApiKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidApiKeyError";
  }
}

class ApiError extends Error {
  constructor(message) {
    super(message);
    this.name = "ApiError";
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
}

class SheetError extends Error {
  constructor(message) {
    super(message);
    this.name = "SheetError";
  }
}

class DrivePermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = "DrivePermissionError";
  }
}

// Mock serializeErrorForHtml function (mirroring ErrorUtils.gs implementation)
function serializeErrorForHtml(error) {
  if (!error) {
    return new Error("Unknown error");
  }

  const CUSTOM_ERROR_TYPES = new Set([
    "InvalidApiKeyError",
    "ApiError",
    "ValidationError",
    "ConfigurationError",
    "SheetError",
    "DrivePermissionError",
  ]);

  if (
    error.name &&
    typeof error.message === "string" &&
    CUSTOM_ERROR_TYPES.has(error.name)
  ) {
    const plainError = new Error(error.message);
    plainError.name = error.name;
    return plainError;
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

// Mock withErrorBoundary function
async function withErrorBoundary(asyncFn, context, defaultValue = null) {
  try {
    return await asyncFn();
  } catch (error) {
    ErrorHandler.handle(error, context, false);
    return defaultValue;
  }
}

// Mock executeWithErrorAggregation function
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

describe("ErrorUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("serializeErrorForHtml", () => {
    test("should serialize InvalidApiKeyError to plain Error", () => {
      const error = new InvalidApiKeyError("Invalid API key");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Invalid API key");
      expect(serialized.name).toBe("InvalidApiKeyError");
      expect(serialized).not.toBeInstanceOf(InvalidApiKeyError);
    });

    test("should serialize ApiError to plain Error", () => {
      const error = new ApiError("API request failed");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("API request failed");
      expect(serialized.name).toBe("ApiError");
      expect(serialized).not.toBeInstanceOf(ApiError);
    });

    test("should serialize ValidationError to plain Error", () => {
      const error = new ValidationError("Validation failed");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Validation failed");
      expect(serialized.name).toBe("ValidationError");
    });

    test("should serialize ConfigurationError to plain Error", () => {
      const error = new ConfigurationError("Configuration error");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Configuration error");
      expect(serialized.name).toBe("ConfigurationError");
    });

    test("should serialize SheetError to plain Error", () => {
      const error = new SheetError("Sheet error");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Sheet error");
      expect(serialized.name).toBe("SheetError");
    });

    test("should serialize DrivePermissionError to plain Error", () => {
      const error = new DrivePermissionError("Permission denied");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Permission denied");
      expect(serialized.name).toBe("DrivePermissionError");
    });

    test("should return plain Error objects as-is", () => {
      const error = new Error("Plain error");
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBe(error);
      expect(serialized.message).toBe("Plain error");
    });

    test("should convert strings to Error objects", () => {
      const error = "String error";
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("String error");
    });

    test("should convert numbers to Error objects", () => {
      const error = 123;
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("123");
    });

    test("should convert null to Error object", () => {
      const error = null;
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Unknown error");
    });

    test("should convert undefined to Error object", () => {
      const error = undefined;
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("Unknown error");
    });

    test("should preserve error message in serialized error", () => {
      const error = new InvalidApiKeyError("Custom error message");
      const serialized = serializeErrorForHtml(error);

      expect(serialized.message).toBe("Custom error message");
    });

    test("should preserve error name in serialized error", () => {
      const error = new ApiError("Test error");
      const serialized = serializeErrorForHtml(error);

      expect(serialized.name).toBe("ApiError");
    });
  });

  describe("withErrorBoundary", () => {
    test("should return result when async function succeeds", async () => {
      const asyncFn = jest.fn().mockResolvedValue("success");
      const result = await withErrorBoundary(asyncFn, "test context");

      expect(result).toBe("success");
      expect(asyncFn).toHaveBeenCalledTimes(1);
      expect(mockErrorHandler.handle).not.toHaveBeenCalled();
    });

    test("should return default value when async function fails", async () => {
      const error = new Error("Test error");
      const asyncFn = jest.fn().mockRejectedValue(error);
      const defaultValue = "default";
      const result = await withErrorBoundary(
        asyncFn,
        "test context",
        defaultValue
      );

      expect(result).toBe(defaultValue);
      expect(mockErrorHandler.handle).toHaveBeenCalledWith(
        error,
        "test context",
        false
      );
    });

    test("should return null when async function fails and no default provided", async () => {
      const error = new Error("Test error");
      const asyncFn = jest.fn().mockRejectedValue(error);
      const result = await withErrorBoundary(asyncFn, "test context");

      expect(result).toBeNull();
      expect(mockErrorHandler.handle).toHaveBeenCalledWith(
        error,
        "test context",
        false
      );
    });

    test("should handle object context", async () => {
      const error = new Error("Test error");
      const asyncFn = jest.fn().mockRejectedValue(error);
      const context = { operation: "test", step: 1 };
      const result = await withErrorBoundary(asyncFn, context);

      expect(result).toBeNull();
      expect(mockErrorHandler.handle).toHaveBeenCalledWith(
        error,
        context,
        false
      );
    });
  });

  describe("executeWithErrorAggregation", () => {
    test("should return all results when all operations succeed", async () => {
      const asyncFns = [
        jest.fn().mockResolvedValue("result1"),
        jest.fn().mockResolvedValue("result2"),
        jest.fn().mockResolvedValue("result3"),
      ];

      const results = await executeWithErrorAggregation(
        asyncFns,
        "test context"
      );

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ success: true, result: "result1" });
      expect(results[1]).toEqual({ success: true, result: "result2" });
      expect(results[2]).toEqual({ success: true, result: "result3" });
      expect(mockErrorHandler.handle).not.toHaveBeenCalled();
    });

    test("should continue when some operations fail", async () => {
      const error1 = new Error("Error 1");
      const error2 = new Error("Error 2");
      const asyncFns = [
        jest.fn().mockResolvedValue("result1"),
        jest.fn().mockRejectedValue(error1),
        jest.fn().mockResolvedValue("result3"),
        jest.fn().mockRejectedValue(error2),
      ];

      const results = await executeWithErrorAggregation(
        asyncFns,
        "test context"
      );

      expect(results).toHaveLength(4);
      expect(results[0]).toEqual({ success: true, result: "result1" });
      expect(results[1]).toEqual({ success: false, error: error1 });
      expect(results[2]).toEqual({ success: true, result: "result3" });
      expect(results[3]).toEqual({ success: false, error: error2 });
      expect(mockErrorHandler.handle).toHaveBeenCalledTimes(2);
    });

    test("should handle string context with operation index", async () => {
      const error = new Error("Test error");
      const asyncFns = [
        jest.fn().mockResolvedValue("result1"),
        jest.fn().mockRejectedValue(error),
      ];

      await executeWithErrorAggregation(asyncFns, "test context");

      expect(mockErrorHandler.handle).toHaveBeenCalledWith(error, {
        description: "test context",
        operationIndex: 1,
      }, false);
    });

    test("should handle object context with operation index", async () => {
      const error = new Error("Test error");
      const asyncFns = [jest.fn().mockRejectedValue(error)];
      const context = { operation: "test", step: 1 };

      await executeWithErrorAggregation(asyncFns, context);

      expect(mockErrorHandler.handle).toHaveBeenCalledWith(error, {
        operation: "test",
        step: 1,
        operationIndex: 0,
      }, false);
    });

    test("should handle all operations failing", async () => {
      const error1 = new Error("Error 1");
      const error2 = new Error("Error 2");
      const asyncFns = [
        jest.fn().mockRejectedValue(error1),
        jest.fn().mockRejectedValue(error2),
      ];

      const results = await executeWithErrorAggregation(
        asyncFns,
        "test context"
      );

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ success: false, error: error1 });
      expect(results[1]).toEqual({ success: false, error: error2 });
      expect(mockErrorHandler.handle).toHaveBeenCalledTimes(2);
    });
  });
});
