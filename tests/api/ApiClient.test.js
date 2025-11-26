/**
 * Tests for ApiClient.gs - API Key Saving and Validation
 */

// Mock constants
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS_COUNT: "/workouts/count",
};

const TOAST_DURATION = {
  NORMAL: 5,
};

// Mock error classes
class InvalidApiKeyError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "InvalidApiKeyError";
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

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context, showToast = true) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock getDocumentProperties
const createMockProperties = () => {
  const store = {};
  return {
    getProperty: jest.fn((key) => store[key] || null),
    setProperty: jest.fn((key, value) => {
      store[key] = value;
    }),
    deleteProperty: jest.fn((key) => {
      delete store[key];
    }),
    getKeys: jest.fn(() => Object.keys(store)),
    getProperties: jest.fn(() => ({ ...store })),
    _store: store, // Expose store for testing
  };
};

const mockGetDocumentProperties = jest.fn(() => createMockProperties());
global.getDocumentProperties = mockGetDocumentProperties;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
  getId: jest.fn(() => "test-spreadsheet-id"),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock UrlFetchApp response
const createMockResponse = (statusCode, contentText = "{}") => {
  return {
    getResponseCode: jest.fn(() => statusCode),
    getContentText: jest.fn(() => contentText),
    getHeaders: jest.fn(() => ({})),
  };
};

// ApiClient class (simplified version for testing)
class ApiClient {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };
    this.cache = {};
    this._apiKeyCheckInProgress = false;
  }

  _getDocumentProperties() {
    const properties = getDocumentProperties();
    if (!properties) {
      throw new ConfigurationError(
        "Unable to access document properties. Please ensure you have proper permissions."
      );
    }
    return properties;
  }

  createRequestOptions(apiKey, method = "get", additionalHeaders = {}) {
    return {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
        ...additionalHeaders,
      },
      muteHttpExceptions: true,
      validateHttpsCertificates: true,
      followRedirects: true,
      timeout: 30000,
    };
  }

  executeRequest(url, options) {
    return UrlFetchApp.fetch(url, options);
  }

  async validateApiKey(apiKey) {
    const url = `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`;
    // Use shorter timeout for validation (15 seconds) since it's just a quick check
    const options = {
      ...this.createRequestOptions(apiKey),
      timeout: 15000, // 15 seconds for validation
    };

    try {
      const response = await this.executeRequest(url, options);

      if (response.getResponseCode() === 401) {
        throw ErrorHandler.handle(
          new InvalidApiKeyError("Invalid or revoked API key"),
          { operation: "Validating API key" },
          false // Don't show toast during validation
        );
      }

      return true;
    } catch (error) {
      // Handle timeout and network errors
      if (
        error.message &&
        (error.message.includes("timeout") ||
          error.message.includes("Timeout") ||
          error.message.includes("DNS error") ||
          error.message.includes("network"))
      ) {
        throw new Error(
          "Request timed out. Please check your internet connection and try again."
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  async saveUserApiKey(apiKey) {
    try {
      await this.validateApiKey(apiKey);
      const properties = this._getDocumentProperties();
      const currentKey = properties.getProperty("HEVY_API_KEY");

      properties.setProperty("HEVY_API_KEY", apiKey);
      properties.deleteProperty("LAST_WORKOUT_UPDATE");
      this._apiKeyCheckInProgress = false;

      if (!currentKey) {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "API key set successfully. Starting initial data import...",
          "Setup Progress",
          TOAST_DURATION.NORMAL
        );
        // Note: runFullImport would be called here, but we'll mock it separately
      } else {
        SpreadsheetApp.getActiveSpreadsheet().toast(
          "API key updated successfully!",
          "Success",
          TOAST_DURATION.NORMAL
        );
      }
    } catch (error) {
      this._apiKeyCheckInProgress = false;

      // Handle invalid API key with user-friendly message
      if (error instanceof InvalidApiKeyError) {
        // Create a serializable error for HTML service
        const serializedError = new Error(
          "Invalid API key. Please check your Hevy Developer Settings and reset your API key."
        );
        serializedError.name = "InvalidApiKeyError";
        throw serializedError;
      }

      // Handle other errors - ensure they're serializable
      const handledError = ErrorHandler.handle(
        error,
        {
          operation: "Saving API key",
        },
        false
      ); // Don't show toast here, let HTML dialog handle it

      // Convert to plain Error for HTML service
      const serializedError = new Error(handledError.message);
      serializedError.name = handledError.name || "Error";
      throw serializedError;
    }
  }
}

describe("ApiClient - validateApiKey", () => {
  let apiClient;
  let mockProperties;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = new ApiClient();
    mockProperties = createMockProperties();
    mockGetDocumentProperties.mockReturnValue(mockProperties);
  });

  test("should validate API key successfully with valid key", async () => {
    const apiKey = "valid-api-key-123";
    const mockResponse = createMockResponse(200, '{"workout_count": 42}');

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    const result = await apiClient.validateApiKey(apiKey);

    expect(result).toBe(true);
    expect(UrlFetchApp.fetch).toHaveBeenCalledWith(
      `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": apiKey,
        }),
        timeout: 15000,
      })
    );
  });

  test("should throw InvalidApiKeyError for 401 response", async () => {
    const apiKey = "invalid-api-key";
    const mockResponse = createMockResponse(401);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);
    mockErrorHandler.handle.mockImplementation((error) => error);

    await expect(apiClient.validateApiKey(apiKey)).rejects.toThrow(
      InvalidApiKeyError
    );

    expect(mockErrorHandler.handle).toHaveBeenCalledWith(
      expect.any(InvalidApiKeyError),
      { operation: "Validating API key" },
      false
    );
  });

  test("should handle timeout errors gracefully", async () => {
    const apiKey = "test-api-key";
    // Error message must include "timeout" (case-insensitive check in code)
    const timeoutError = new Error("timeout error");

    UrlFetchApp.fetch.mockRejectedValue(timeoutError);

    await expect(apiClient.validateApiKey(apiKey)).rejects.toThrow(
      "Request timed out. Please check your internet connection and try again."
    );
  });

  test("should handle DNS errors", async () => {
    const apiKey = "test-api-key";
    const dnsError = new Error("DNS error occurred");

    UrlFetchApp.fetch.mockRejectedValue(dnsError);

    await expect(apiClient.validateApiKey(apiKey)).rejects.toThrow(
      "Request timed out. Please check your internet connection and try again."
    );
  });

  test("should handle network errors", async () => {
    const apiKey = "test-api-key";
    const networkError = new Error("network error occurred");

    UrlFetchApp.fetch.mockRejectedValue(networkError);

    await expect(apiClient.validateApiKey(apiKey)).rejects.toThrow(
      "Request timed out. Please check your internet connection and try again."
    );
  });

  test("should use 15-second timeout for validation", async () => {
    const apiKey = "test-api-key";
    const mockResponse = createMockResponse(200);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.validateApiKey(apiKey);

    expect(UrlFetchApp.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 15000,
      })
    );
  });

  test("should make request to correct endpoint", async () => {
    const apiKey = "test-api-key";
    const mockResponse = createMockResponse(200);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.validateApiKey(apiKey);

    expect(UrlFetchApp.fetch).toHaveBeenCalledWith(
      `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`,
      expect.any(Object)
    );
  });

  test("should re-throw non-timeout/network errors", async () => {
    const apiKey = "test-api-key";
    const otherError = new Error("Some other error");

    UrlFetchApp.fetch.mockRejectedValue(otherError);

    await expect(apiClient.validateApiKey(apiKey)).rejects.toThrow(
      "Some other error"
    );
  });
});

describe("ApiClient - saveUserApiKey", () => {
  let apiClient;
  let mockProperties;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = new ApiClient();
    mockProperties = createMockProperties();
    mockGetDocumentProperties.mockReturnValue(mockProperties);
  });

  test("should save new API key successfully", async () => {
    const apiKey = "new-api-key-123";
    const mockResponse = createMockResponse(200);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.saveUserApiKey(apiKey);

    expect(mockProperties.setProperty).toHaveBeenCalledWith(
      "HEVY_API_KEY",
      apiKey
    );
    expect(mockProperties.deleteProperty).toHaveBeenCalledWith(
      "LAST_WORKOUT_UPDATE"
    );
    expect(apiClient._apiKeyCheckInProgress).toBe(false);
    expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
      "API key set successfully. Starting initial data import...",
      "Setup Progress",
      TOAST_DURATION.NORMAL
    );
  });

  test("should update existing API key successfully", async () => {
    const oldApiKey = "old-api-key";
    const newApiKey = "new-api-key-123";
    const mockResponse = createMockResponse(200);

    // Set existing key
    mockProperties._store["HEVY_API_KEY"] = oldApiKey;

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.saveUserApiKey(newApiKey);

    expect(mockProperties.setProperty).toHaveBeenCalledWith(
      "HEVY_API_KEY",
      newApiKey
    );
    expect(mockProperties.deleteProperty).toHaveBeenCalledWith(
      "LAST_WORKOUT_UPDATE"
    );
    expect(apiClient._apiKeyCheckInProgress).toBe(false);
    expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
      "API key updated successfully!",
      "Success",
      TOAST_DURATION.NORMAL
    );
  });

  test("should validate API key before saving", async () => {
    const apiKey = "test-api-key";
    const mockResponse = createMockResponse(200);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.saveUserApiKey(apiKey);

    expect(UrlFetchApp.fetch).toHaveBeenCalled();
    expect(mockProperties.setProperty).toHaveBeenCalled();
  });

  test("should throw serialized InvalidApiKeyError for invalid key", async () => {
    const apiKey = "invalid-api-key";
    const mockResponse = createMockResponse(401);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);
    mockErrorHandler.handle.mockImplementation((error) => error);

    await expect(apiClient.saveUserApiKey(apiKey)).rejects.toThrow(
      "Invalid API key. Please check your Hevy Developer Settings and reset your API key."
    );

    const error = await apiClient.saveUserApiKey(apiKey).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("InvalidApiKeyError");
    expect(apiClient._apiKeyCheckInProgress).toBe(false);
  });

  test("should reset _apiKeyCheckInProgress flag on error", async () => {
    const apiKey = "invalid-api-key";
    const mockResponse = createMockResponse(401);

    apiClient._apiKeyCheckInProgress = true;
    UrlFetchApp.fetch.mockResolvedValue(mockResponse);
    mockErrorHandler.handle.mockImplementation((error) => error);

    await expect(apiClient.saveUserApiKey(apiKey)).rejects.toThrow();

    expect(apiClient._apiKeyCheckInProgress).toBe(false);
  });

  test("should serialize other errors for HTML service", async () => {
    const apiKey = "test-api-key";
    // Simulate an error during property access (after validation passes)
    const mockResponse = createMockResponse(200);
    const propertyError = new Error("Property access failed");

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);
    mockProperties.getProperty.mockImplementation(() => {
      throw propertyError;
    });
    mockErrorHandler.handle.mockReturnValue(
      new ApiError("Server error", 500, "Response")
    );

    await expect(apiClient.saveUserApiKey(apiKey)).rejects.toThrow(Error);

    const error = await apiClient.saveUserApiKey(apiKey).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiError");
    expect(apiClient._apiKeyCheckInProgress).toBe(false);
  });

  test("should delete LAST_WORKOUT_UPDATE property", async () => {
    const apiKey = "test-api-key";
    const mockResponse = createMockResponse(200);

    mockProperties._store["LAST_WORKOUT_UPDATE"] = "some-value";
    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    await apiClient.saveUserApiKey(apiKey);

    expect(mockProperties.deleteProperty).toHaveBeenCalledWith(
      "LAST_WORKOUT_UPDATE"
    );
  });

  test("should not show toast for errors (let HTML dialog handle it)", async () => {
    const apiKey = "invalid-api-key";
    const mockResponse = createMockResponse(401);

    UrlFetchApp.fetch.mockResolvedValue(mockResponse);
    mockErrorHandler.handle.mockImplementation((error, context, showToast) => {
      expect(showToast).toBe(false);
      return error;
    });

    await expect(apiClient.saveUserApiKey(apiKey)).rejects.toThrow();
  });

  test("should handle ConfigurationError when properties unavailable", async () => {
    const apiKey = "test-api-key";
    const mockResponse = createMockResponse(200);

    // Mock validation to pass
    UrlFetchApp.fetch.mockResolvedValue(mockResponse);

    // But properties are unavailable
    mockGetDocumentProperties.mockReturnValue(null);
    mockErrorHandler.handle.mockReturnValue(
      new ConfigurationError(
        "Unable to access document properties. Please ensure you have proper permissions."
      )
    );

    await expect(apiClient.saveUserApiKey(apiKey)).rejects.toThrow(
      "Unable to access document properties. Please ensure you have proper permissions."
    );

    // Verify error was serialized (plain Error, not ConfigurationError)
    try {
      await apiClient.saveUserApiKey(apiKey);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ConfigurationError");
    }
  });
});
