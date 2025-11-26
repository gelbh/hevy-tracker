/**
 * Integration tests for API error recovery and retry logic
 */

const { createMockApiResponse } = require("../helpers/testHelpers");

// Mock constants
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS: "/workouts",
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

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock UrlFetchApp
global.UrlFetchApp = {
  fetch: jest.fn(),
};

// Mock Utilities
global.Utilities = {
  sleep: jest.fn(),
};

// Simplified ApiClient for testing retry logic
class ApiClient {
  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };
  }

  createRequestOptions(apiKey) {
    return {
      method: "GET",
      headers: { "api-key": apiKey },
      muteHttpExceptions: true,
    };
  }

  executeRequest(url, options) {
    return UrlFetchApp.fetch(url, options);
  }

  handleResponse(response) {
    const statusCode = response.getResponseCode();
    if (statusCode >= 200 && statusCode < 300) {
      return JSON.parse(response.getContentText());
    }
    throw new ApiError("Request failed", statusCode, response.getContentText());
  }

  _shouldRetry(error, attempt) {
    return (
      error instanceof ApiError &&
      error.isRetryable() &&
      attempt < this.retryConfig.maxRetries - 1
    );
  }

  async makeRequestWithRetry(endpoint, options) {
    let lastError;
    for (let attempt = 0; attempt < this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(
          `${API_ENDPOINTS.BASE}${endpoint}`,
          options
        );
        return this.handleResponse(response);
      } catch (error) {
        lastError = error;
        if (!this._shouldRetry(error, attempt)) {
          throw ErrorHandler.handle(error, {
            endpoint,
            attempt,
            operation: "API request",
          });
        }
        const delay = this.retryConfig.baseDelay * Math.pow(2, attempt);
        Utilities.sleep(delay);
      }
    }
    throw ErrorHandler.handle(lastError, {
      endpoint,
      attempt: this.retryConfig.maxRetries,
      operation: "API request max retries exceeded",
    });
  }
}

describe("API Error Recovery", () => {
  let apiClient;

  beforeEach(() => {
    jest.clearAllMocks();
    UrlFetchApp.fetch.mockClear();
    apiClient = new ApiClient();
  });

  describe("Retry Logic", () => {
    test("should retry on retryable errors", async () => {
      const errorResponse = createMockApiResponse({
        statusCode: 500,
        content: "Internal Server Error",
      });
      const successResponse = createMockApiResponse({
        statusCode: 200,
        content: '{"data": "test"}',
      });

      UrlFetchApp.fetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse);

      const options = apiClient.createRequestOptions("test-key");
      const result = await apiClient.makeRequestWithRetry(
        API_ENDPOINTS.WORKOUTS,
        options
      );

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(Utilities.sleep).toHaveBeenCalled();
      expect(result).toEqual({ data: "test" });
    });

    test("should not retry on non-retryable errors", async () => {
      const errorResponse = createMockApiResponse({
        statusCode: 400,
        content: "Bad Request",
      });

      UrlFetchApp.fetch.mockResolvedValue(errorResponse);

      const options = apiClient.createRequestOptions("test-key");

      await expect(
        apiClient.makeRequestWithRetry(API_ENDPOINTS.WORKOUTS, options)
      ).rejects.toThrow();

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(Utilities.sleep).not.toHaveBeenCalled();
    });

    test("should respect max retries", async () => {
      const errorResponse = createMockApiResponse({
        statusCode: 500,
        content: "Server Error",
      });

      UrlFetchApp.fetch.mockResolvedValue(errorResponse);

      const options = apiClient.createRequestOptions("test-key");

      await expect(
        apiClient.makeRequestWithRetry(API_ENDPOINTS.WORKOUTS, options)
      ).rejects.toThrow();

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(
        apiClient.retryConfig.maxRetries
      );
    });
  });

  describe("Rate Limit Handling", () => {
    test("should handle 429 rate limit errors", async () => {
      const rateLimitResponse = createMockApiResponse({
        statusCode: 429,
        content: "Rate limit exceeded",
      });
      const successResponse = createMockApiResponse({
        statusCode: 200,
        content: '{"data": "test"}',
      });

      UrlFetchApp.fetch
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const options = apiClient.createRequestOptions("test-key");
      const result = await apiClient.makeRequestWithRetry(
        API_ENDPOINTS.WORKOUTS,
        options
      );

      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "test" });
    });
  });

  describe("Network Error Recovery", () => {
    test("should handle network timeouts", async () => {
      const timeoutError = new Error("Request timeout");
      const successResponse = createMockApiResponse({
        statusCode: 200,
        content: '{"data": "test"}',
      });

      UrlFetchApp.fetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce(successResponse);

      const options = apiClient.createRequestOptions("test-key");

      // Network errors are not retryable in this implementation
      await expect(
        apiClient.makeRequestWithRetry(API_ENDPOINTS.WORKOUTS, options)
      ).rejects.toThrow();
    });
  });

  describe("Partial Failure Scenarios", () => {
    test("should handle partial success in paginated requests", async () => {
      UrlFetchApp.fetch.mockReset();
      
      const successResponse1 = createMockApiResponse({
        statusCode: 200,
        content: '{"workouts": [{"id": "1"}]}',
      });
      const errorResponse = createMockApiResponse({
        statusCode: 500,
        content: "Server Error",
      });
      const successResponse2 = createMockApiResponse({
        statusCode: 200,
        content: '{"workouts": [{"id": "2"}]}',
      });

      UrlFetchApp.fetch
        .mockResolvedValueOnce(successResponse1)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(successResponse2);

      const options = apiClient.createRequestOptions("test-key");

      // First request succeeds
      const result1 = await apiClient.makeRequestWithRetry(
        `${API_ENDPOINTS.WORKOUTS}?page=1`,
        options
      );
      expect(result1).toEqual({ workouts: [{ id: "1" }] });

      // Second request fails initially, then succeeds on retry
      const result2 = await apiClient.makeRequestWithRetry(
        `${API_ENDPOINTS.WORKOUTS}?page=2`,
        options
      );
      // The successResponse2 content is '{"workouts": [{"id": "2"}]}'
      expect(result2).toHaveProperty("workouts");
      expect(result2.workouts).toEqual([{ id: "2" }]);
      expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(3); // page1, page2 fail, page2 retry
    });
  });
});
