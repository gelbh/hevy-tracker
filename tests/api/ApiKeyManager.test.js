/**
 * Tests for ApiKeyManager.gs
 */

// Mock constants
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS_COUNT: "/workouts/count",
};

const TOAST_DURATION = {
  NORMAL: 5,
  SHORT: 3,
  LONG: 10,
};

const DIALOG_DIMENSIONS = {
  API_KEY_WIDTH: 400,
  API_KEY_HEIGHT: 300,
};

global.API_ENDPOINTS = API_ENDPOINTS;
global.TOAST_DURATION = TOAST_DURATION;
global.DIALOG_DIMENSIONS = DIALOG_DIMENSIONS;

// Mock error classes
class InvalidApiKeyError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidApiKeyError";
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

class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const HTTP_STATUS = {
  UNAUTHORIZED: 401,
};

global.InvalidApiKeyError = InvalidApiKeyError;
global.ValidationError = ValidationError;
global.ConfigurationError = ConfigurationError;
global.ApiError = ApiError;
global.HTTP_STATUS = HTTP_STATUS;

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => error),
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
    _store: store,
  };
};

const mockGetDocumentProperties = jest.fn(() => createMockProperties());
global.getDocumentProperties = mockGetDocumentProperties;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
  getUi: jest.fn(() => ({
    alert: jest.fn(() => "YES"),
    ButtonSet: { YES_NO: "YES_NO" },
    Button: { YES: "YES", NO: "NO" },
  })),
};

// Mock showHtmlDialog
global.showHtmlDialog = jest.fn();

// Mock ScriptApp
global.ScriptApp = {
  getProjectTriggers: jest.fn(() => []),
  newTrigger: jest.fn(() => ({
    timeBased: jest.fn(() => ({
      at: jest.fn(() => ({
        create: jest.fn(),
      })),
    })),
  })),
  EventType: {
    CLOCK: "CLOCK",
  },
};

// Mock UrlFetchApp
const createMockResponse = (statusCode) => ({
  getResponseCode: jest.fn(() => statusCode),
  getContentText: jest.fn(() => "{}"),
  getHeaders: jest.fn(() => ({})),
});

global.UrlFetchApp = {
  fetch: jest.fn(),
};

// Mock ApiClient
class MockApiClient {
  constructor() {
    this._getApiClientConfig = jest.fn(() => ({
      VALIDATION_TIMEOUT_MS: 15000,
      REQUEST_TIMEOUT_MS: 30000,
    }));
    this.createRequestOptions = jest.fn((apiKey) => ({
      method: "GET",
      headers: { "api-key": apiKey },
      timeout: 30000,
    }));
    this.executeRequest = jest.fn();
    this._isNetworkError = jest.fn((error) => {
      const message = error?.message?.toLowerCase() ?? "";
      return ["timeout", "dns error", "network"].some((keyword) =>
        message.includes(keyword)
      );
    });
  }
}

// ApiKeyManager class (simplified for testing)
class ApiKeyManager {
  constructor(apiClient) {
    this.apiClient = apiClient;
    this._apiKeyCheckInProgress = false;
  }

  getApiKeyFromProperties() {
    const properties = getDocumentProperties();
    return properties?.getProperty("HEVY_API_KEY") ?? null;
  }

  getOrPromptApiKey() {
    const key = this.getApiKeyFromProperties();
    if (key) {
      return key;
    }

    if (!this._apiKeyCheckInProgress) {
      this.promptForApiKey(
        "An API key is required. Would you like to set it now?"
      );
    }
    return null;
  }

  manageApiKey() {
    try {
      const currentKey = this.getApiKeyFromProperties();
      if (currentKey && !this.confirmKeyReset()) {
        this._apiKeyCheckInProgress = false;
        return;
      }

      this._showApiKeyDialog();
    } catch (error) {
      this._apiKeyCheckInProgress = false;
      throw ErrorHandler.handle(error, "Managing API key");
    }
  }

  _showApiKeyDialog() {
    showHtmlDialog("ui/dialogs/SetApiKey", {
      width: DIALOG_DIMENSIONS.API_KEY_WIDTH,
      height: DIALOG_DIMENSIONS.API_KEY_HEIGHT,
    });
  }

  saveUserApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      throw new ValidationError("API key must be a non-empty string");
    }

    const trimmed = apiKey.trim();
    if (trimmed.length === 0) {
      throw new ValidationError("API key cannot be empty");
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(trimmed)) {
      throw new ValidationError(
        "Invalid API key format. API key must be a valid UUID (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
      );
    }

    if (trimmed.length !== 36) {
      throw new ValidationError("API key must be exactly 36 characters long.");
    }

    const properties = this._getDocumentProperties();
    const currentKey = properties.getProperty("HEVY_API_KEY");
    const apiKeyToSave = trimmed;

    properties.setProperty("HEVY_API_KEY", apiKeyToSave);
    properties.deleteProperty("LAST_WORKOUT_UPDATE");
    this._apiKeyCheckInProgress = false;

    if (!currentKey) {
      this._showToast(
        "API key set successfully. Starting initial data import...",
        "Setup Progress",
        TOAST_DURATION.NORMAL
      );
      this._scheduleInitialImport();
    } else {
      this._showToast(
        "API key updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    }

    // Background validation
    this.validateApiKey(apiKeyToSave)
      .then(() => {
        console.log("API key validation succeeded");
      })
      .catch((error) => {
        console.error("API key validation failed:", error);
        const props = this._getDocumentProperties();
        props.deleteProperty("HEVY_API_KEY");
        props.deleteProperty("LAST_WORKOUT_UPDATE");
      });
  }

  _showToast(message, title, duration = TOAST_DURATION.NORMAL) {
    SpreadsheetApp.getActiveSpreadsheet().toast(message, title, duration);
  }

  promptForApiKey(message) {
    if (this._apiKeyCheckInProgress) {
      return;
    }

    this._apiKeyCheckInProgress = true;
    const ui = SpreadsheetApp.getUi();
    if (
      ui.alert("Hevy API Key Required", message, ui.ButtonSet.YES_NO) ===
      ui.Button.YES
    ) {
      this.manageApiKey();
    } else {
      this._apiKeyCheckInProgress = false;
    }
  }

  confirmKeyReset() {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      "Hevy API Key Management",
      "A Hevy API key is already set. Would you like to reset it?",
      ui.ButtonSet.YES_NO
    );
    return response === ui.Button.YES;
  }

  async validateApiKey(apiKey) {
    const url = `${API_ENDPOINTS.BASE}${API_ENDPOINTS.WORKOUTS_COUNT}`;
    const config = this.apiClient._getApiClientConfig();
    const options = {
      ...this.apiClient.createRequestOptions(apiKey),
      timeout: config.VALIDATION_TIMEOUT_MS,
    };

    try {
      const response = await this.apiClient.executeRequest(url, options);

      if (response.getResponseCode() === HTTP_STATUS.UNAUTHORIZED) {
        throw ErrorHandler.handle(
          new InvalidApiKeyError("Invalid or revoked API key"),
          { operation: "Validating API key" },
          false
        );
      }

      return true;
    } catch (error) {
      if (this.apiClient._isNetworkError(error)) {
        throw new Error(
          "Request timed out. Please check your internet connection and try again."
        );
      }
      throw error;
    }
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

  _scheduleInitialImport() {
    try {
      const triggers = ScriptApp.getProjectTriggers();
      triggers
        .filter(
          (t) =>
            t.getHandlerFunction() === "runInitialImport" &&
            t.getEventType() === ScriptApp.EventType.CLOCK
        )
        .forEach((t) => ScriptApp.deleteTrigger(t));

      const triggerTime = new Date(Date.now() + 2000);
      ScriptApp.newTrigger("runInitialImport")
        .timeBased()
        .at(triggerTime)
        .create();
    } catch (error) {
      console.error("Failed to schedule initial import:", error);
      ErrorHandler.handle(
        error,
        { operation: "Scheduling initial import trigger" },
        false
      );
    }
  }

  resetApiKeyCheckInProgress() {
    this._apiKeyCheckInProgress = false;
  }
}

describe("ApiKeyManager", () => {
  let apiKeyManager;
  let mockApiClient;
  let mockProperties;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient = new MockApiClient();
    apiKeyManager = new ApiKeyManager(mockApiClient);
    mockProperties = createMockProperties();
    mockGetDocumentProperties.mockReturnValue(mockProperties);
  });

  describe("getApiKeyFromProperties()", () => {
    test("should return API key if exists", () => {
      mockProperties._store["HEVY_API_KEY"] = "test-key-123";

      const result = apiKeyManager.getApiKeyFromProperties();

      expect(result).toBe("test-key-123");
    });

    test("should return null if key does not exist", () => {
      const result = apiKeyManager.getApiKeyFromProperties();

      expect(result).toBeNull();
    });

    test("should return null if properties is null", () => {
      mockGetDocumentProperties.mockReturnValue(null);

      const result = apiKeyManager.getApiKeyFromProperties();

      expect(result).toBeNull();
    });
  });

  describe("getOrPromptApiKey()", () => {
    test("should return key if exists", () => {
      mockProperties._store["HEVY_API_KEY"] = "test-key";

      const result = apiKeyManager.getOrPromptApiKey();

      expect(result).toBe("test-key");
    });

    test("should prompt if no key and not in progress", () => {
      apiKeyManager.promptForApiKey = jest.fn();

      const result = apiKeyManager.getOrPromptApiKey();

      expect(result).toBeNull();
      expect(apiKeyManager.promptForApiKey).toHaveBeenCalledWith(
        "An API key is required. Would you like to set it now?"
      );
    });

    test("should not prompt if check in progress", () => {
      apiKeyManager._apiKeyCheckInProgress = true;
      apiKeyManager.promptForApiKey = jest.fn();

      const result = apiKeyManager.getOrPromptApiKey();

      expect(result).toBeNull();
      expect(apiKeyManager.promptForApiKey).not.toHaveBeenCalled();
    });
  });

  describe("saveUserApiKey()", () => {
    test("should throw ValidationError for non-string", () => {
      expect(() => apiKeyManager.saveUserApiKey(null)).toThrow(ValidationError);
      expect(() => apiKeyManager.saveUserApiKey(123)).toThrow(ValidationError);
    });

    test("should throw ValidationError for empty string", () => {
      expect(() => apiKeyManager.saveUserApiKey("")).toThrow(ValidationError);
      expect(() => apiKeyManager.saveUserApiKey("   ")).toThrow(
        ValidationError
      );
    });

    test("should throw ValidationError for invalid UUID format", () => {
      expect(() => apiKeyManager.saveUserApiKey("invalid-key")).toThrow(
        ValidationError
      );
      expect(() =>
        apiKeyManager.saveUserApiKey("12345678-1234-1234-1234-1234567890123")
      ).toThrow(ValidationError);
    });

    test("should save valid UUID key", () => {
      const validKey = "12345678-1234-1234-1234-123456789012";
      mockApiClient.executeRequest.mockResolvedValue(createMockResponse(200));

      apiKeyManager.saveUserApiKey(validKey);

      expect(mockProperties.setProperty).toHaveBeenCalledWith(
        "HEVY_API_KEY",
        validKey
      );
      expect(mockProperties.deleteProperty).toHaveBeenCalledWith(
        "LAST_WORKOUT_UPDATE"
      );
    });

    test("should trim whitespace from key", () => {
      const keyWithSpaces = "  12345678-1234-1234-1234-123456789012  ";
      const trimmedKey = "12345678-1234-1234-1234-123456789012";
      mockApiClient.executeRequest.mockResolvedValue(createMockResponse(200));

      apiKeyManager.saveUserApiKey(keyWithSpaces);

      expect(mockProperties.setProperty).toHaveBeenCalledWith(
        "HEVY_API_KEY",
        trimmedKey
      );
    });

    test("should show different toast for new vs existing key", () => {
      const validKey = "12345678-1234-1234-1234-123456789012";
      mockApiClient.executeRequest.mockResolvedValue(createMockResponse(200));

      // New key
      apiKeyManager.saveUserApiKey(validKey);
      expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
        "API key set successfully. Starting initial data import...",
        "Setup Progress",
        TOAST_DURATION.NORMAL
      );

      jest.clearAllMocks();

      // Existing key
      mockProperties._store["HEVY_API_KEY"] = "old-key";
      apiKeyManager.saveUserApiKey(validKey);
      expect(mockSpreadsheet.toast).toHaveBeenCalledWith(
        "API key updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    });
  });

  describe("validateApiKey()", () => {
    test("should return true for valid key", async () => {
      const apiKey = "12345678-1234-1234-1234-123456789012";
      mockApiClient.executeRequest.mockResolvedValue(createMockResponse(200));

      const result = await apiKeyManager.validateApiKey(apiKey);

      expect(result).toBe(true);
      expect(mockApiClient.executeRequest).toHaveBeenCalled();
    });

    test("should throw InvalidApiKeyError for 401", async () => {
      const apiKey = "12345678-1234-1234-1234-123456789012";
      mockApiClient.executeRequest.mockResolvedValue(createMockResponse(401));
      mockErrorHandler.handle.mockImplementation((error) => error);

      await expect(apiKeyManager.validateApiKey(apiKey)).rejects.toThrow(
        InvalidApiKeyError
      );
    });

    test("should handle network errors", async () => {
      const apiKey = "12345678-1234-1234-1234-123456789012";
      const networkError = new Error("timeout error");
      mockApiClient.executeRequest.mockRejectedValue(networkError);
      mockApiClient._isNetworkError.mockReturnValue(true);

      await expect(apiKeyManager.validateApiKey(apiKey)).rejects.toThrow(
        "Request timed out. Please check your internet connection and try again."
      );
    });
  });

  describe("confirmKeyReset()", () => {
    test("should return true when user confirms", () => {
      SpreadsheetApp.getUi().alert.mockReturnValue("YES");

      const result = apiKeyManager.confirmKeyReset();

      expect(result).toBe(true);
    });

    test("should return false when user cancels", () => {
      const mockUi = {
        alert: jest.fn(() => "NO"),
        ButtonSet: { YES_NO: "YES_NO" },
        Button: { YES: "YES", NO: "NO" },
      };
      SpreadsheetApp.getUi.mockReturnValue(mockUi);

      const result = apiKeyManager.confirmKeyReset();

      expect(result).toBe(false);
    });
  });

  describe("manageApiKey()", () => {
    test("should show dialog if no key exists", () => {
      apiKeyManager._showApiKeyDialog = jest.fn();

      apiKeyManager.manageApiKey();

      expect(apiKeyManager._showApiKeyDialog).toHaveBeenCalled();
    });

    test("should confirm reset if key exists", () => {
      mockProperties._store["HEVY_API_KEY"] = "existing-key";
      apiKeyManager.confirmKeyReset = jest.fn(() => true);
      apiKeyManager._showApiKeyDialog = jest.fn();

      apiKeyManager.manageApiKey();

      expect(apiKeyManager.confirmKeyReset).toHaveBeenCalled();
      expect(apiKeyManager._showApiKeyDialog).toHaveBeenCalled();
    });

    test("should not show dialog if user cancels reset", () => {
      mockProperties._store["HEVY_API_KEY"] = "existing-key";
      apiKeyManager.confirmKeyReset = jest.fn(() => false);
      apiKeyManager._showApiKeyDialog = jest.fn();

      apiKeyManager.manageApiKey();

      expect(apiKeyManager._showApiKeyDialog).not.toHaveBeenCalled();
      expect(apiKeyManager._apiKeyCheckInProgress).toBe(false);
    });
  });
});
