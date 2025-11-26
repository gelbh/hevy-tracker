/**
 * Tests for Utils.gs - API Key Saving functionality
 */

// Mock ErrorHandler and error classes
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

// Mock serializeErrorForHtml function (mirroring Utils.gs implementation)
function serializeErrorForHtml(error) {
  // HTML service can only serialize plain Error objects with message strings
  // Custom error types need to be converted
  // Use error.name for more reliable cross-file checking
  if (error && error.name && typeof error.message === "string") {
    const errorName = error.name;
    if (
      errorName === "InvalidApiKeyError" ||
      errorName === "ApiError" ||
      errorName === "ValidationError" ||
      errorName === "ConfigurationError" ||
      errorName === "SheetError" ||
      errorName === "DrivePermissionError"
    ) {
      // Create a plain Error with the message for HTML service
      const plainError = new Error(error.message);
      plainError.name = errorName;
      return plainError;
    }
  }

  // If it's already a plain Error, return as-is
  if (error instanceof Error) {
    return error;
  }

  // For any other type, convert to Error
  return new Error(String(error));
}

// Mock apiClient
const mockApiClient = {
  saveUserApiKey: jest.fn(),
};

// Mock saveUserApiKey wrapper function (mirroring Utils.gs implementation)
function saveUserApiKey(apiKey) {
  try {
    // Call the async method - google.script.run will handle the async execution
    // but we need to ensure errors are serializable
    const result = mockApiClient.saveUserApiKey(apiKey);

    // If it returns a promise, we can't await it here (sync function)
    // But errors thrown will be caught below and serialized
    return result;
  } catch (error) {
    // Ensure error is serializable for HTML service
    throw serializeErrorForHtml(error);
  }
}

describe("Utils - Error Serialization", () => {
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
      const error = new ApiError("API request failed", 500, "Response body");
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
      const error = new SheetError("Sheet error", "Workouts");
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
      expect(serialized.message).toBe("null");
    });

    test("should convert undefined to Error object", () => {
      const error = undefined;
      const serialized = serializeErrorForHtml(error);

      expect(serialized).toBeInstanceOf(Error);
      expect(serialized.message).toBe("undefined");
    });

    test("should preserve error message in serialized error", () => {
      const error = new InvalidApiKeyError("Custom error message");
      const serialized = serializeErrorForHtml(error);

      expect(serialized.message).toBe("Custom error message");
    });

    test("should preserve error name in serialized error", () => {
      const error = new ApiError("Test error", 400);
      const serialized = serializeErrorForHtml(error);

      expect(serialized.name).toBe("ApiError");
    });
  });

  describe("saveUserApiKey wrapper", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test("should call apiClient.saveUserApiKey with correct parameter", () => {
      const apiKey = "test-api-key-123";
      mockApiClient.saveUserApiKey.mockReturnValue(undefined);

      saveUserApiKey(apiKey);

      expect(mockApiClient.saveUserApiKey).toHaveBeenCalledWith(apiKey);
      expect(mockApiClient.saveUserApiKey).toHaveBeenCalledTimes(1);
    });

    test("should return result from apiClient.saveUserApiKey", () => {
      const apiKey = "test-api-key-123";
      const expectedResult = { success: true };
      mockApiClient.saveUserApiKey.mockReturnValue(expectedResult);

      const result = saveUserApiKey(apiKey);

      expect(result).toBe(expectedResult);
    });

    test("should serialize InvalidApiKeyError before throwing", () => {
      const apiKey = "test-api-key-123";
      const error = new InvalidApiKeyError("Invalid API key");
      mockApiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey(apiKey)).toThrow(Error);
      expect(() => saveUserApiKey(apiKey)).toThrow("Invalid API key");
    });

    test("should serialize ApiError before throwing", () => {
      const apiKey = "test-api-key-123";
      const error = new ApiError("API request failed", 500);
      mockApiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey(apiKey)).toThrow(Error);
      expect(() => saveUserApiKey(apiKey)).toThrow("API request failed");
    });

    test("should serialize ValidationError before throwing", () => {
      const apiKey = "test-api-key-123";
      const error = new ValidationError("Validation failed");
      mockApiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey(apiKey)).toThrow(Error);
      expect(() => saveUserApiKey(apiKey)).toThrow("Validation failed");
    });

    test("should handle plain Error objects", () => {
      const apiKey = "test-api-key-123";
      const error = new Error("Plain error");
      mockApiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey(apiKey)).toThrow(Error);
      expect(() => saveUserApiKey(apiKey)).toThrow("Plain error");
    });

    test("should handle non-Error types", () => {
      const apiKey = "test-api-key-123";
      const error = "String error";
      mockApiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey(apiKey)).toThrow(Error);
      expect(() => saveUserApiKey(apiKey)).toThrow("String error");
    });
  });
});
