/**
 * Tests for ImportManager.gs - Core pagination and import step methods
 */

// Mock constants
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS: "/workouts",
};

const TOAST_DURATION = {
  NORMAL: 5,
  SHORT: 3,
  LONG: 10,
};

const MAX_PAGES = 1000;
const RATE_LIMIT = {
  API_DELAY: 100,
};

const HTTP_STATUS = {
  NOT_FOUND: 404,
};

global.API_ENDPOINTS = API_ENDPOINTS;
global.TOAST_DURATION = TOAST_DURATION;
global.MAX_PAGES = MAX_PAGES;
global.RATE_LIMIT = RATE_LIMIT;
global.HTTP_STATUS = HTTP_STATUS;

// Mock error classes
class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

class ImportTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportTimeoutError";
  }
}

global.ApiError = ApiError;
global.ImportTimeoutError = ImportTimeoutError;

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => error),
};

global.ErrorHandler = mockErrorHandler;

// Mock ImportProgressTracker
const mockImportProgressTracker = {
  isStepComplete: jest.fn(() => false),
  loadProgress: jest.fn(() => ({ completedSteps: [] })),
  saveProgress: jest.fn(),
};

global.ImportProgressTracker = mockImportProgressTracker;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

global.getActiveSpreadsheet = jest.fn(() => mockSpreadsheet);

// Mock Utilities
global.Utilities = {
  sleep: jest.fn(),
};

// Mock ApiKeyManager
class MockApiKeyManager {
  constructor() {
    this.getOrPromptApiKey = jest.fn(() => "test-api-key");
    this.getApiKeyFromProperties = jest.fn(() => "test-api-key");
  }
}

// Mock ApiClient
class MockApiClient {
  constructor() {
    this.makeRequest = jest.fn();
    this.createRequestOptions = jest.fn((apiKey) => ({
      method: "GET",
      headers: { "api-key": apiKey },
    }));
  }
}

// ImportManager class (simplified for testing)
class ImportManager {
  constructor(apiClient, apiKeyManager) {
    this.apiClient = apiClient;
    this.apiKeyManager = apiKeyManager;
  }

  _showToast(message, title, duration = TOAST_DURATION.NORMAL) {
    getActiveSpreadsheet().toast(message, title, duration);
  }

  async executeImportStep(stepName, importFn, completedSteps, checkTimeout) {
    if (ImportProgressTracker.isStepComplete(stepName)) {
      return;
    }

    if (checkTimeout && checkTimeout()) {
      return;
    }

    this._showToast(
      `Starting import: ${stepName}...`,
      "Import Progress",
      TOAST_DURATION.SHORT
    );

    try {
      await importFn();
      const currentProgress = ImportProgressTracker.loadProgress();
      const updatedSteps = currentProgress?.completedSteps ?? [];
      if (!updatedSteps.includes(stepName)) {
        updatedSteps.push(stepName);
      }
      if (!completedSteps.includes(stepName)) {
        completedSteps.push(stepName);
      }
      ImportProgressTracker.saveProgress(updatedSteps);
      this._showToast(
        `Completed: ${stepName} ✓`,
        "Import Progress",
        TOAST_DURATION.SHORT
      );
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        throw error;
      }
      throw error;
    }
  }

  async fetchPaginatedData(
    endpoint,
    pageSize,
    processFn,
    dataKey,
    additionalParams = {},
    checkTimeout = null
  ) {
    const apiKey = this.apiKeyManager.getOrPromptApiKey();
    if (!apiKey) return 0;

    let page = 1;
    let totalProcessed = 0;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      try {
        if (checkTimeout && checkTimeout()) {
          throw new ImportTimeoutError(
            `Timeout approaching while fetching ${endpoint} (page ${page})`
          );
        }

        const response = await this.fetchPage(
          endpoint,
          apiKey,
          page,
          pageSize,
          additionalParams
        );
        const result = await this.processPageData(
          response,
          dataKey,
          processFn,
          pageSize,
          page
        );

        totalProcessed += result.processedCount;
        hasMore = result.hasMore;

        if (hasMore) {
          page++;
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      } catch (error) {
        if (error instanceof ImportTimeoutError) {
          throw error;
        }
        if (
          error instanceof ApiError &&
          error.statusCode === HTTP_STATUS.NOT_FOUND
        ) {
          break;
        }
        throw ErrorHandler.handle(error, {
          endpoint,
          page,
          operation: "Fetching paginated data",
        });
      }
    }

    if (page > MAX_PAGES) {
      throw ErrorHandler.handle(
        new Error(
          `Maximum page limit (${MAX_PAGES}) reached while fetching ${endpoint}. ` +
            "This may indicate an infinite loop or API inconsistency. " +
            `Total items processed: ${totalProcessed}`
        ),
        {
          endpoint,
          page,
          totalProcessed,
          operation: "Fetching paginated data - maximum page limit exceeded",
        }
      );
    }

    return totalProcessed;
  }

  async fetchPage(endpoint, apiKey, page, pageSize, additionalParams) {
    const queryParams = {
      page,
      page_size: pageSize,
      ...additionalParams,
    };

    return await this.apiClient.makeRequest(
      endpoint,
      this.apiClient.createRequestOptions(apiKey),
      queryParams
    );
  }

  async processPageData(response, dataKey, processFn, pageSize, page) {
    const items = response[dataKey] ?? [];
    if (items.length === 0) {
      return { processedCount: 0, hasMore: false };
    }

    await processFn(items);

    return {
      processedCount: items.length,
      hasMore:
        items.length === pageSize &&
        (!response.page_count || page < response.page_count),
    };
  }
}

describe("ImportManager", () => {
  let importManager;
  let mockApiClient;
  let mockApiKeyManager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = new MockApiClient();
    mockApiKeyManager = new MockApiKeyManager();
    importManager = new ImportManager(mockApiClient, mockApiKeyManager);
  });

  describe("executeImportStep()", () => {
    test("should skip if step already complete", async () => {
      mockImportProgressTracker.isStepComplete.mockReturnValue(true);
      const importFn = jest.fn();

      await importManager.executeImportStep("test-step", importFn, [], null);

      expect(importFn).not.toHaveBeenCalled();
      expect(mockSpreadsheet.toast).not.toHaveBeenCalled();
    });

    test("should skip if timeout detected", async () => {
      mockImportProgressTracker.isStepComplete.mockReturnValue(false);
      const checkTimeout = jest.fn(() => true);
      const importFn = jest.fn();

      await importManager.executeImportStep(
        "test-step",
        importFn,
        [],
        checkTimeout
      );

      expect(importFn).not.toHaveBeenCalled();
      expect(checkTimeout).toHaveBeenCalled();
    });

    test("should execute import function and track progress", async () => {
      mockImportProgressTracker.isStepComplete.mockReturnValue(false);
      const importFn = jest.fn().mockResolvedValue();
      const completedSteps = [];

      await importManager.executeImportStep(
        "test-step",
        importFn,
        completedSteps,
        null
      );

      expect(importFn).toHaveBeenCalled();
      expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
        "Starting import: test-step...",
        "Import Progress",
        TOAST_DURATION.SHORT
      );
      expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
        "Completed: test-step ✓",
        "Import Progress",
        TOAST_DURATION.SHORT
      );
      expect(completedSteps).toContain("test-step");
      expect(mockImportProgressTracker.saveProgress).toHaveBeenCalled();
    });

    test("should re-throw ImportTimeoutError", async () => {
      mockImportProgressTracker.isStepComplete.mockReturnValue(false);
      const importFn = jest
        .fn()
        .mockRejectedValue(new ImportTimeoutError("Timeout"));

      await expect(
        importManager.executeImportStep("test-step", importFn, [], null)
      ).rejects.toThrow(ImportTimeoutError);
    });

    test("should re-throw other errors", async () => {
      mockImportProgressTracker.isStepComplete.mockReturnValue(false);
      const error = new Error("Test error");
      const importFn = jest.fn().mockRejectedValue(error);

      await expect(
        importManager.executeImportStep("test-step", importFn, [], null)
      ).rejects.toThrow("Test error");
    });
  });

  describe("fetchPage()", () => {
    test("should call makeRequest with correct parameters", async () => {
      const mockResponse = { workouts: [] };
      mockApiClient.makeRequest.mockResolvedValue(mockResponse);

      const result = await importManager.fetchPage(
        "/workouts",
        "test-key",
        1,
        50,
        { filter: "recent" }
      );

      expect(mockApiClient.makeRequest).toHaveBeenCalledWith(
        "/workouts",
        expect.any(Object),
        {
          page: 1,
          page_size: 50,
          filter: "recent",
        }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("processPageData()", () => {
    test("should process items and return correct counts", async () => {
      const response = {
        workouts: [{ id: 1 }, { id: 2 }, { id: 3 }],
        page_count: 5,
      };
      const processFn = jest.fn().mockResolvedValue();

      const result = await importManager.processPageData(
        response,
        "workouts",
        processFn,
        3,
        1
      );

      expect(processFn).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(result).toEqual({
        processedCount: 3,
        hasMore: true, // 3 items = pageSize and page < page_count
      });
    });

    test("should return hasMore false when items less than pageSize", async () => {
      const response = {
        workouts: [{ id: 1 }, { id: 2 }],
        page_count: 5,
      };
      const processFn = jest.fn().mockResolvedValue();

      const result = await importManager.processPageData(
        response,
        "workouts",
        processFn,
        3,
        1
      );

      expect(result).toEqual({
        processedCount: 2,
        hasMore: false,
      });
    });

    test("should return hasMore false when no items", async () => {
      const response = { workouts: [] };
      const processFn = jest.fn();

      const result = await importManager.processPageData(
        response,
        "workouts",
        processFn,
        3,
        1
      );

      expect(processFn).not.toHaveBeenCalled();
      expect(result).toEqual({
        processedCount: 0,
        hasMore: false,
      });
    });

    test("should handle missing dataKey gracefully", async () => {
      const response = { otherData: [] };
      const processFn = jest.fn();

      const result = await importManager.processPageData(
        response,
        "workouts",
        processFn,
        3,
        1
      );

      expect(processFn).not.toHaveBeenCalled();
      expect(result).toEqual({
        processedCount: 0,
        hasMore: false,
      });
    });
  });

  describe("fetchPaginatedData()", () => {
    test("should return 0 if no API key", async () => {
      mockApiKeyManager.getOrPromptApiKey.mockReturnValue(null);

      const result = await importManager.fetchPaginatedData(
        "/workouts",
        50,
        jest.fn(),
        "workouts"
      );

      expect(result).toBe(0);
    });

    test("should fetch single page", async () => {
      const processFn = jest.fn().mockResolvedValue();
      const response = {
        workouts: [{ id: 1 }, { id: 2 }],
        page_count: 1,
      };
      mockApiClient.makeRequest.mockResolvedValue(response);

      const result = await importManager.fetchPaginatedData(
        "/workouts",
        50,
        processFn,
        "workouts"
      );

      expect(result).toBe(2);
      expect(processFn).toHaveBeenCalledTimes(1);
      expect(mockApiClient.makeRequest).toHaveBeenCalledTimes(1);
    });

    test("should fetch multiple pages", async () => {
      const processFn = jest.fn().mockResolvedValue();
      mockApiClient.makeRequest
        .mockResolvedValueOnce({
          workouts: Array(50).fill({ id: 1 }),
          page_count: 3,
        })
        .mockResolvedValueOnce({
          workouts: Array(50).fill({ id: 2 }),
          page_count: 3,
        })
        .mockResolvedValueOnce({
          workouts: Array(30).fill({ id: 3 }),
          page_count: 3,
        });

      const result = await importManager.fetchPaginatedData(
        "/workouts",
        50,
        processFn,
        "workouts"
      );

      expect(result).toBe(130);
      expect(processFn).toHaveBeenCalledTimes(3);
      expect(mockApiClient.makeRequest).toHaveBeenCalledTimes(3);
      expect(Utilities.sleep).toHaveBeenCalledTimes(2); // Between pages
    });

    test("should handle timeout during pagination", async () => {
      const processFn = jest.fn().mockResolvedValue();
      const checkTimeout = jest
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true); // Timeout on second page
      mockApiClient.makeRequest.mockResolvedValueOnce({
        workouts: Array(50).fill({ id: 1 }),
        page_count: 3,
      });

      await expect(
        importManager.fetchPaginatedData(
          "/workouts",
          50,
          processFn,
          "workouts",
          {},
          checkTimeout
        )
      ).rejects.toThrow(ImportTimeoutError);
    });

    test("should break on 404 NOT_FOUND", async () => {
      const processFn = jest.fn().mockResolvedValue();
      mockApiClient.makeRequest
        .mockResolvedValueOnce({
          workouts: Array(50).fill({ id: 1 }),
          page_count: 3,
        })
        .mockRejectedValueOnce(new ApiError("Not found", 404));

      const result = await importManager.fetchPaginatedData(
        "/workouts",
        50,
        processFn,
        "workouts"
      );

      expect(result).toBe(50);
      expect(processFn).toHaveBeenCalledTimes(1);
    });

    test("should throw error for max pages exceeded", async () => {
      const processFn = jest.fn().mockResolvedValue();
      // Create responses that will cause max pages to be exceeded
      const fullPageResponse = {
        workouts: Array(50).fill({ id: 1 }),
        page_count: MAX_PAGES + 1,
      };

      // Mock MAX_PAGES + 1 responses
      for (let i = 0; i <= MAX_PAGES; i++) {
        mockApiClient.makeRequest.mockResolvedValueOnce(fullPageResponse);
      }

      await expect(
        importManager.fetchPaginatedData("/workouts", 50, processFn, "workouts")
      ).rejects.toThrow("Maximum page limit");
    });

    test("should pass additionalParams to fetchPage", async () => {
      const processFn = jest.fn().mockResolvedValue();
      const additionalParams = { filter: "recent", sort: "date" };
      mockApiClient.makeRequest.mockResolvedValue({
        workouts: [],
      });

      await importManager.fetchPaginatedData(
        "/workouts",
        50,
        processFn,
        "workouts",
        additionalParams
      );

      expect(mockApiClient.makeRequest).toHaveBeenCalledWith(
        "/workouts",
        expect.any(Object),
        expect.objectContaining({
          filter: "recent",
          sort: "date",
        })
      );
    });
  });
});
