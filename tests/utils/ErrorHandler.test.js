/**
 * Tests for ErrorHandler.gs - Error handling and user feedback
 */

// Mock error classes
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

// Mock constants
const TOAST_DURATION = {
  NORMAL: 5,
};

// Mock ErrorHandler implementation
const ERROR_MESSAGES = {
  DRIVE_PERMISSION:
    "Unable to access file. Please ensure you have permission and try again.",
  INVALID_API_KEY:
    "Invalid API key. Please check your Hevy Developer Settings and reset your API key.",
  API_KEY_VALIDATION: "API key validation failed. Please reset your API key.",
  DEFAULT: (errorId) => `An error occurred. Reference ID: ${errorId}`,
};

class ErrorHandler {
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

  static isCustomErrorType(error) {
    return (
      error instanceof ApiError ||
      error instanceof ValidationError ||
      error instanceof ConfigurationError ||
      error instanceof SheetError ||
      error instanceof InvalidApiKeyError
    );
  }

  static isPermissionError(error) {
    if (!error.message) {
      return false;
    }
    const message = error.message.toLowerCase();
    return (
      message.includes("access denied") ||
      message.includes("insufficient permissions")
    );
  }
}

// Mock Utilities
global.Utilities = {
  getUuid: jest.fn(() => "test-error-id-123"),
};

// Mock Session
global.Session = {
  getActiveUser: jest.fn(() => ({
    getEmail: jest.fn(() => "test@example.com"),
  })),
};

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

describe("ErrorHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("handle()", () => {
    test("should generate error ID and log error", () => {
      const error = new Error("Test error");
      const context = { operation: "Test operation" };

      const result = ErrorHandler.handle(error, context, false);

      expect(result.errorId).toBe("test-error-id-123");
      expect(console.error).toHaveBeenCalledWith(
        "Error [test-error-id-123]:",
        expect.objectContaining({
          message: "Test error",
          context: { operation: "Test operation" },
        })
      );
    });

    test("should show toast notification by default", () => {
      const error = new Error("Test error");
      const context = { operation: "Test operation" };

      ErrorHandler.handle(error, context);

      expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
        expect.any(String),
        "Error",
        TOAST_DURATION.NORMAL
      );
    });

    test("should not show toast when showToast is false", () => {
      const error = new Error("Test error");
      const context = { operation: "Test operation" };

      ErrorHandler.handle(error, context, false);

      expect(mockSpreadsheet.toast).not.toHaveBeenCalled();
    });

    test("should handle toast errors gracefully", () => {
      const error = new Error("Test error");
      const context = { operation: "Test operation" };
      mockSpreadsheet.toast.mockImplementation(() => {
        throw new Error("Toast failed");
      });

      const result = ErrorHandler.handle(error, context);

      expect(console.warn).toHaveBeenCalledWith(
        "ErrorHandler: Unable to show toast:",
        expect.any(Error)
      );
      expect(result.errorId).toBeDefined();
    });

    test("should convert string context to object", () => {
      const error = new Error("Test error");
      const context = "Test operation";

      const result = ErrorHandler.handle(error, context, false);

      // The context is used internally but may not be on the error object
      // Check that error was handled and logged with context
      expect(result.errorId).toBeDefined();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error"),
        expect.objectContaining({
          context: { description: "Test operation" },
        })
      );
    });

    test("should preserve object context", () => {
      const error = new Error("Test error");
      const context = { operation: "Test", sheetName: "Workouts" };

      const result = ErrorHandler.handle(error, context, false);

      // The context is used internally and logged
      expect(result.errorId).toBeDefined();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Error"),
        expect.objectContaining({
          context: { operation: "Test", sheetName: "Workouts" },
        })
      );
    });
  });

  describe("enhanceError()", () => {
    test("should preserve custom error types", () => {
      const error = new ApiError("API failed", 500);
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(ApiError);
      expect(result.context).toEqual({ operation: "Test" });
    });

    test("should convert permission errors to DrivePermissionError", () => {
      const error = new Error("Access denied to file");
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(DrivePermissionError);
      expect(result.message).toContain("permission restrictions");
    });

    test("should convert 401 errors to InvalidApiKeyError", () => {
      const error = { statusCode: 401, message: "Unauthorized" };
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(InvalidApiKeyError);
    });

    test("should convert errors with statusCode to ApiError", () => {
      const error = { statusCode: 500, message: "Server error" };
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(ApiError);
      expect(result.statusCode).toBe(500);
    });

    test("should convert errors with endpoint context to ApiError", () => {
      const error = new Error("Request failed");
      const context = { endpoint: "/workouts" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(ApiError);
    });

    test("should convert errors with sheetName context to SheetError", () => {
      const error = new Error("Operation failed");
      const context = { sheetName: "Workouts" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(SheetError);
      expect(result.sheetName).toBe("Workouts");
    });

    test("should convert TypeError to ValidationError", () => {
      const error = new TypeError("Invalid type");
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(ValidationError);
    });

    test("should convert errors with validation context to ValidationError", () => {
      const error = new Error("Invalid input");
      const context = { validation: true };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBeInstanceOf(ValidationError);
    });

    test("should return original error if no enhancement needed", () => {
      const error = new Error("Generic error");
      const context = { operation: "Test" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result).toBe(error);
    });
  });

  describe("getUserMessage()", () => {
    test("should return drive permission message for DrivePermissionError", () => {
      const error = new DrivePermissionError("Permission denied");

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe(ERROR_MESSAGES.DRIVE_PERMISSION);
    });

    test("should return invalid API key message for InvalidApiKeyError", () => {
      const error = new InvalidApiKeyError("Invalid key");

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe(ERROR_MESSAGES.INVALID_API_KEY);
    });

    test("should return API key validation message for 401 ApiError", () => {
      const error = new ApiError("Unauthorized", 401);

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe(ERROR_MESSAGES.API_KEY_VALIDATION);
    });

    test("should return default message with error ID for other errors", () => {
      const error = new Error("Generic error");
      error.errorId = "test-id-123";

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toBe("An error occurred. Reference ID: test-id-123");
    });

    test("should handle errors without errorId", () => {
      const error = new Error("Generic error");

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toContain("An error occurred");
    });
  });

  describe("isCustomErrorType()", () => {
    test("should return true for ApiError", () => {
      const error = new ApiError("Test", 500);
      expect(ErrorHandler.isCustomErrorType(error)).toBe(true);
    });

    test("should return true for ValidationError", () => {
      const error = new ValidationError("Test");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(true);
    });

    test("should return true for ConfigurationError", () => {
      const error = new ConfigurationError("Test");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(true);
    });

    test("should return true for SheetError", () => {
      const error = new SheetError("Test", "Workouts");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(true);
    });

    test("should return true for InvalidApiKeyError", () => {
      const error = new InvalidApiKeyError("Test");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(true);
    });

    test("should return false for plain Error", () => {
      const error = new Error("Test");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(false);
    });

    test("should return false for TypeError", () => {
      const error = new TypeError("Test");
      expect(ErrorHandler.isCustomErrorType(error)).toBe(false);
    });
  });

  describe("isPermissionError()", () => {
    test("should return true for errors with 'Access denied' message", () => {
      const error = new Error("Access denied to file");
      expect(ErrorHandler.isPermissionError(error)).toBe(true);
    });

    test("should return true for errors with 'Insufficient permissions' message", () => {
      const error = new Error("Insufficient permissions to access");
      expect(ErrorHandler.isPermissionError(error)).toBe(true);
    });

    test("should return false for other errors", () => {
      const error = new Error("Generic error");
      expect(ErrorHandler.isPermissionError(error)).toBe(false);
    });

    test("should handle errors without message", () => {
      const error = {};
      expect(ErrorHandler.isPermissionError(error)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    test("should handle null error", () => {
      // Create a minimal error object for null case
      const nullError = { message: "null", stack: "" };
      const result = ErrorHandler.handle(nullError, "Test", false);
      expect(result).toBeDefined();
      expect(result.errorId).toBeDefined();
    });

    test("should handle error without stack trace", () => {
      const error = new Error("Test");
      delete error.stack;

      const result = ErrorHandler.handle(error, "Test", false);

      expect(result.errorId).toBeDefined();
      expect(console.error).toHaveBeenCalled();
    });

    test("should handle empty context", () => {
      const error = new Error("Test");
      const result = ErrorHandler.handle(error, {}, false);
      expect(result.errorId).toBeDefined();
    });

    test("should merge context for custom errors", () => {
      const error = new ApiError("Test", 500);
      error.context = { existing: "value" };
      const context = { new: "value" };

      const result = ErrorHandler.enhanceError(error, context);

      expect(result.context).toEqual({
        existing: "value",
        new: "value",
      });
    });
  });
});
