/**
 * Tests for ApiClient.gs - Extended API client methods beyond API key saving
 */

// Mock constants
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS: "/workouts",
  WORKOUTS_COUNT: "/workouts/count",
};

// Mock error classes
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

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
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
    _store: store,
  };
};

const mockProperties = createMockProperties();
global.getDocumentProperties = jest.fn(() => mockProperties);

// Mock UrlFetchApp
const createMockResponse = (statusCode, contentText = "{}") => {
  return {
    getResponseCode: jest.fn(() => statusCode),
    getContentText: jest.fn(() => contentText),
    getHeaders: jest.fn(() => ({})),
  };
};

global.UrlFetchApp = {
  fetch: jest.fn(),
};

// Mock Utilities
global.Utilities = {
  sleep: jest.fn(),
};

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
  getId: jest.fn(() => "spreadsheet-123"),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
  getUi: jest.fn(() => ({
    alert: jest.fn(() => "OK"),
    ButtonSet: { YES_NO: "YES_NO" },
    Button: { YES: "YES", NO: "NO" },
  })),
};

// Mock ScriptApp
global.ScriptApp = {
  getUserTriggers: jest.fn(() => []),
  newTrigger: jest.fn(() => ({
    forSpreadsheet: jest.fn(() => ({
      onOpen: jest.fn(() => ({
        create: jest.fn(),
      })),
    })),
  })),
  EventType: {
    ON_OPEN: "ON_OPEN",
  },
};

// Simplified ApiClient for testing extended methods
class ApiClient {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };
    this.cache = {};
  }

  _getDocumentProperties() {
    const properties = getDocumentProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access document properties");
    }
    return properties;
  }

  _getApiKeyFromProperties() {
    const properties = getDocumentProperties();
    return properties?.getProperty("HEVY_API_KEY") || null;
  }

  getOrPromptApiKey() {
    const key = this._getApiKeyFromProperties();
    if (key) {
      return key;
    }
    return null;
  }

  createRequestOptions(apiKey, method = "get", additionalHeaders = {}) {
    return {
      method: method.toUpperCase(),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Api-Key": apiKey,
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

  buildUrl(endpoint, queryParams) {
    const baseUrl = `${API_ENDPOINTS.BASE}${endpoint}`;
    return Object.keys(queryParams).length === 0
      ? baseUrl
      : `${baseUrl}?${this.buildQueryString(queryParams)}`;
  }

  buildQueryString(params) {
    return Object.entries(params)
      .filter(([_, value]) => value != null)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      )
      .join("&");
  }

  getCacheKey(endpoint, queryParams) {
    return `${endpoint}?${this.buildQueryString(queryParams)}`;
  }

  calculateBackoff(attempt) {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt),
      this.retryConfig.maxDelay
    );
    return delay * (0.5 + Math.random() * 0.5);
  }

  handleResponse(response) {
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 204) return null;

    if (statusCode >= 200 && statusCode < 300) {
      try {
        return JSON.parse(responseText);
      } catch (error) {
        throw ErrorHandler.handle(
          new ApiError("Invalid JSON response from API", statusCode, responseText),
          { operation: "Parsing API response" }
        );
      }
    }

    throw ErrorHandler.handle(
      new ApiError(
        `API request failed with status ${statusCode}`,
        statusCode,
        responseText
      ),
      { operation: "API response error" }
    );
  }

  _shouldRetry(error, attempt) {
    return (
      error instanceof ApiError &&
      error.isRetryable() &&
      attempt < this.retryConfig.maxRetries - 1
    );
  }

  async makeRequest(endpoint, options, queryParams = {}, payload = null) {
    const cacheKey = this.getCacheKey(endpoint, queryParams);
    if (options.method === "GET" && this.cache[cacheKey]) {
      return this.cache[cacheKey];
    }

    const url = this.buildUrl(endpoint, queryParams);
    if (payload) {
      options.payload = typeof payload === "string" ? payload : JSON.stringify(payload);
    }

    let lastError;
    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(url, options);
        const parsedResponse = this.handleResponse(response);

        if (options.method === "GET") {
          this.cache[cacheKey] = parsedResponse;
        }

        return parsedResponse;
      } catch (error) {
        lastError = error;

        if (!this._shouldRetry(error, attempt)) {
          throw ErrorHandler.handle(error, {
            endpoint,
            queryParams,
            attempt,
            operation: "API request",
          });
        }

        const delay = this.calculateBackoff(attempt);
        Utilities.sleep(delay);
      }
    }

    throw ErrorHandler.handle(lastError, {
      endpoint,
      queryParams,
      attempt: this.retryConfig.maxRetries,
      operation: "API request max retries exceeded",
    });
  }
}

describe("ApiClient - Extended Methods", () => {
  let apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    apiClient = new ApiClient();
    apiClient.cache = {};
    mockProperties._store = {};
    getDocumentProperties.mockReturnValue(mockProperties);
  });

  describe("getOrPromptApiKey()", () => {
    test("should return API key if exists", () => {
      mockProperties._store.HEVY_API_KEY = "test-key";
      mockProperties.getProperty.mockImplementation((key) => {
        return mockProperties._store[key] || null;
      });

      const result = apiClient.getOrPromptApiKey();

      expect(result).toBe("test-key");
    });

    test("should return null if no API key", () => {
      const result = apiClient.getOrPromptApiKey();

      expect(result).toBe(null);
    });
  });

  describe("createRequestOptions()", () => {
    test("should create GET request options", () => {
      const options = apiClient.createRequestOptions("test-key");

      expect(options.method).toBe("GET");
      expect(options.headers["Api-Key"]).toBe("test-key");
      expect(options.headers["Accept"]).toBe("application/json");
    });

    test("should create POST request options", () => {
      const options = apiClient.createRequestOptions("test-key", "post");

      expect(options.method).toBe("POST");
    });

    test("should include additional headers", () => {
      const options = apiClient.createRequestOptions("test-key", "get", {
        "Custom-Header": "value",
      });

      expect(options.headers["Custom-Header"]).toBe("value");
    });
  });

  describe("buildUrl()", () => {
    test("should build URL without query params", () => {
      const url = apiClient.buildUrl("/workouts", {});

      expect(url).toBe("https://api.hevyapp.com/v1/workouts");
    });

    test("should build URL with query params", () => {
      const url = apiClient.buildUrl("/workouts", { page: 1, pageSize: 10 });

      expect(url).toContain("page=1");
      expect(url).toContain("pageSize=10");
    });
  });

  describe("buildQueryString()", () => {
    test("should build query string from params", () => {
      const queryString = apiClient.buildQueryString({ page: 1, size: 10 });

      expect(queryString).toContain("page=1");
      expect(queryString).toContain("size=10");
    });

    test("should filter out null values", () => {
      const queryString = apiClient.buildQueryString({
        page: 1,
        filter: null,
        size: 10,
      });

      expect(queryString).not.toContain("filter");
      expect(queryString).toContain("page=1");
      expect(queryString).toContain("size=10");
    });
  });

  describe("getCacheKey()", () => {
    test("should generate cache key from endpoint and params", () => {
      const key = apiClient.getCacheKey("/workouts", { page: 1 });

      expect(key).toContain("/workouts");
      expect(key).toContain("page=1");
    });
  });

  describe("calculateBackoff()", () => {
    test("should calculate exponential backoff", () => {
      const delay1 = apiClient.calculateBackoff(0);
      const delay2 = apiClient.calculateBackoff(1);
      const delay3 = apiClient.calculateBackoff(2);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    test("should respect max delay", () => {
      const delay = apiClient.calculateBackoff(10);

      expect(delay).toBeLessThanOrEqual(apiClient.retryConfig.maxDelay * 1.5);
    });
  });

  describe("handleResponse()", () => {
    test("should parse successful JSON response", () => {
      const response = createMockResponse(200, '{"data": "test"}');

      const result = apiClient.handleResponse(response);

      expect(result).toEqual({ data: "test" });
    });

    test("should return null for 204 No Content", () => {
      const response = createMockResponse(204);

      const result = apiClient.handleResponse(response);

      expect(result).toBe(null);
    });

    test("should throw ApiError for error status codes", () => {
      const response = createMockResponse(500, "Internal Server Error");

      expect(() => apiClient.handleResponse(response)).toThrow(ApiError);
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });

    test("should handle invalid JSON", () => {
      const response = createMockResponse(200, "invalid json");

      expect(() => apiClient.handleResponse(response)).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("makeRequest()", () => {
    test("should make successful GET request", async () => {
      const response = createMockResponse(200, '{"data": "test"}');
      UrlFetchApp.fetch.mockResolvedValue(response);
      const options = apiClient.createRequestOptions("test-key");

      const result = await apiClient.makeRequest("/workouts", options);

      expect(result).toEqual({ data: "test" });
      expect(UrlFetchApp.fetch).toHaveBeenCalled();
    });

    test("should cache GET requests", async () => {
      const response = createMockResponse(200, '{"data": "test"}');
      UrlFetchApp.fetch.mockResolvedValue(response);
      const options = apiClient.createRequestOptions("test-key");

      await apiClient.makeRequest("/workouts", options, { page: 1 });
      await apiClient.makeRequest("/workouts", options, { page: 1 });

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    test("should retry on retryable errors", async () => {
      const errorResponse = createMockResponse(500, "Server Error");
      const successResponse = createMockResponse(200, '{"data": "test"}');
      UrlFetchApp.fetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);
      const options = apiClient.createRequestOptions("test-key");

      const result = await apiClient.makeRequest("/workouts", options);

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(Utilities.sleep).toHaveBeenCalled();
      expect(result).toEqual({ data: "test" });
    });

    test("should not retry on non-retryable errors", async () => {
      const errorResponse = createMockResponse(400, "Bad Request");
      UrlFetchApp.fetch.mockResolvedValue(errorResponse);
      const options = apiClient.createRequestOptions("test-key");

      await expect(
        apiClient.makeRequest("/workouts", options)
      ).rejects.toThrow();

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    test("should include payload for POST requests", async () => {
      const response = createMockResponse(201, '{"id": "123"}');
      UrlFetchApp.fetch.mockResolvedValue(response);
      const options = apiClient.createRequestOptions("test-key", "post");
      const payload = { title: "Test" };

      await apiClient.makeRequest("/workouts", options, {}, payload);

      expect(UrlFetchApp.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          payload: JSON.stringify(payload),
        })
      );
    });
  });
});

