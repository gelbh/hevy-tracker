/**
 * Tests for ApiKeyUtils.gs - Developer API key management functions
 */

// Mock constants
const DEV_API_KEY_PREFIX = "DEV_API_KEY_";
const TOAST_DURATION = {
  NORMAL: 5,
};

global.TOAST_DURATION = TOAST_DURATION;

// Mock error classes
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

global.ValidationError = ValidationError;
global.ConfigurationError = ConfigurationError;

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => error),
};

global.ErrorHandler = mockErrorHandler;

// Mock PropertiesService
const createPropertiesStore = () => {
  const store = {};
  return {
    getProperty: jest.fn((key) => store[key] || null),
    setProperty: jest.fn((key, value) => {
      store[key] = value;
    }),
    deleteProperty: jest.fn((key) => {
      delete store[key];
    }),
    getProperties: jest.fn(() => ({ ...store })),
    _store: store,
  };
};

const mockUserProperties = createPropertiesStore();
const mockDocumentProperties = createPropertiesStore();
const mockScriptProperties = createPropertiesStore();

global.PropertiesService = {
  getUserProperties: jest.fn(() => mockUserProperties),
  getDocumentProperties: jest.fn(() => mockDocumentProperties),
  getScriptProperties: jest.fn(() => mockScriptProperties),
};

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
};

const mockUi = {
  alert: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
  getUi: jest.fn(() => mockUi),
};

// Mock functions
const getDevApiKeyPropertyKey = (label) => `${DEV_API_KEY_PREFIX}${label}`;

const getUserProperties = () => PropertiesService.getUserProperties();
const getDocumentProperties = () => mockDocumentProperties;
const getActiveSpreadsheet = () => mockSpreadsheet;

const isDeveloper = jest.fn(() => true);

const serializeErrorForHtml = (error) => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
};

const migrateDevApiKeysToUserProperties = jest.fn();

const apiClient = {
  saveUserApiKey: jest.fn(),
  runFullImport: jest.fn(),
};

global.apiClient = apiClient;

// Mock functions
function saveUserApiKey(apiKey) {
  try {
    apiClient.saveUserApiKey(apiKey);
  } catch (error) {
    throw serializeErrorForHtml(error);
  }
}

function saveDevApiKey(label, key) {
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  migrateDevApiKeysToUserProperties();

  if (!label || typeof label !== "string" || label.trim().length === 0) {
    throw new ValidationError("Label must be a non-empty string");
  }

  if (!key || typeof key !== "string") {
    throw new ValidationError("API key must be a non-empty string");
  }

  const trimmed = key.trim();
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

  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  userProperties.setProperty(getDevApiKeyPropertyKey(label.trim()), trimmed);
}

function useApiKey(label) {
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  const storedKey = userProperties.getProperty(getDevApiKeyPropertyKey(label));

  if (!storedKey) {
    SpreadsheetApp.getUi().alert(`No key found for label: ${label}`);
    return;
  }

  const documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.setProperty("HEVY_API_KEY", storedKey);
  documentProperties.deleteProperty("LAST_WORKOUT_UPDATE");

  getActiveSpreadsheet().toast(
    `Switched to API key: ${label}`,
    "Developer Mode",
    TOAST_DURATION.NORMAL
  );

  apiClient.runFullImport();
}

function removeApiKey(label) {
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  userProperties.deleteProperty(getDevApiKeyPropertyKey(label));
  getActiveSpreadsheet().toast(
    `API Key "${label}" removed.`,
    "Developer Action",
    TOAST_DURATION.NORMAL
  );
}

function getApiKeyDataForUI() {
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  migrateDevApiKeysToUserProperties();

  const props = userProperties.getProperties();
  const keys = Object.entries(props)
    .filter(([key]) => key.startsWith(DEV_API_KEY_PREFIX))
    .map(([key, value]) => ({
      label: key.replace(DEV_API_KEY_PREFIX, ""),
      key: value,
    }));
  const current =
    PropertiesService.getDocumentProperties().getProperty("HEVY_API_KEY");
  return { keys, current };
}

describe("ApiKeyUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear stores
    Object.keys(mockUserProperties._store).forEach(
      (key) => delete mockUserProperties._store[key]
    );
    Object.keys(mockDocumentProperties._store).forEach(
      (key) => delete mockDocumentProperties._store[key]
    );
    Object.keys(mockScriptProperties._store).forEach(
      (key) => delete mockScriptProperties._store[key]
    );
    isDeveloper.mockReturnValue(true);
  });

  describe("saveUserApiKey", () => {
    test("should call apiClient.saveUserApiKey", () => {
      const apiKey = "test-api-key";
      saveUserApiKey(apiKey);

      expect(apiClient.saveUserApiKey).toHaveBeenCalledWith(apiKey);
    });

    test("should serialize error before throwing", () => {
      const error = new ValidationError("Invalid key");
      apiClient.saveUserApiKey.mockImplementation(() => {
        throw error;
      });

      expect(() => saveUserApiKey("invalid")).toThrow(Error);
      expect(() => saveUserApiKey("invalid")).toThrow("Invalid key");
    });
  });

  describe("saveDevApiKey", () => {
    const validUuid = "12345678-1234-1234-1234-123456789012";

    test("should save valid API key with valid label", () => {
      saveDevApiKey("test-label", validUuid);

      expect(mockUserProperties.setProperty).toHaveBeenCalledWith(
        "DEV_API_KEY_test-label",
        validUuid
      );
    });

    test("should trim label and key", () => {
      saveDevApiKey("  test-label  ", `  ${validUuid}  `);

      expect(mockUserProperties.setProperty).toHaveBeenCalledWith(
        "DEV_API_KEY_test-label",
        validUuid
      );
    });

    test("should throw ConfigurationError if not developer", () => {
      isDeveloper.mockReturnValue(false);

      expect(() => saveDevApiKey("label", validUuid)).toThrow(
        ConfigurationError
      );
      expect(() => saveDevApiKey("label", validUuid)).toThrow("Access denied");
    });

    test("should throw ValidationError for empty label", () => {
      expect(() => saveDevApiKey("", validUuid)).toThrow(ValidationError);
      expect(() => saveDevApiKey("   ", validUuid)).toThrow(ValidationError);
      expect(() => saveDevApiKey(null, validUuid)).toThrow(ValidationError);
    });

    test("should throw ValidationError for invalid UUID format", () => {
      expect(() => saveDevApiKey("label", "not-a-uuid")).toThrow(
        ValidationError
      );
      expect(() => saveDevApiKey("label", "12345")).toThrow(ValidationError);
    });

    test("should throw ValidationError for wrong length", () => {
      expect(() =>
        saveDevApiKey("label", "12345678-1234-1234-1234-1234567890123")
      ).toThrow(ValidationError);
    });

    test("should throw ConfigurationError if user properties unavailable", () => {
      PropertiesService.getUserProperties.mockReturnValueOnce(null);

      expect(() => saveDevApiKey("label", validUuid)).toThrow(
        ConfigurationError
      );
    });
  });

  describe("useApiKey", () => {
    const validUuid = "12345678-1234-1234-1234-123456789012";

    test("should switch to stored API key", () => {
      mockUserProperties._store["DEV_API_KEY_test-label"] = validUuid;
      useApiKey("test-label");

      expect(mockDocumentProperties.setProperty).toHaveBeenCalledWith(
        "HEVY_API_KEY",
        validUuid
      );
      expect(mockDocumentProperties.deleteProperty).toHaveBeenCalledWith(
        "LAST_WORKOUT_UPDATE"
      );
      expect(mockSpreadsheet.toast).toHaveBeenCalled();
      expect(apiClient.runFullImport).toHaveBeenCalled();
    });

    test("should show alert if key not found", () => {
      useApiKey("non-existent");

      expect(mockUi.alert).toHaveBeenCalledWith(
        "No key found for label: non-existent"
      );
      expect(mockDocumentProperties.setProperty).not.toHaveBeenCalled();
    });

    test("should throw ConfigurationError if not developer", () => {
      isDeveloper.mockReturnValue(false);

      expect(() => useApiKey("label")).toThrow(ConfigurationError);
    });
  });

  describe("removeApiKey", () => {
    test("should remove API key", () => {
      mockUserProperties._store["DEV_API_KEY_test-label"] = "some-key";
      removeApiKey("test-label");

      expect(mockUserProperties.deleteProperty).toHaveBeenCalledWith(
        "DEV_API_KEY_test-label"
      );
      expect(mockSpreadsheet.toast).toHaveBeenCalled();
    });

    test("should throw ConfigurationError if not developer", () => {
      isDeveloper.mockReturnValue(false);

      expect(() => removeApiKey("label")).toThrow(ConfigurationError);
    });
  });

  describe("getApiKeyDataForUI", () => {
    test("should return all keys and current key", () => {
      mockUserProperties._store["DEV_API_KEY_key1"] = "uuid1";
      mockUserProperties._store["DEV_API_KEY_key2"] = "uuid2";
      mockUserProperties._store["OTHER_PROP"] = "other";
      mockDocumentProperties._store["HEVY_API_KEY"] = "current-uuid";

      const result = getApiKeyDataForUI();

      expect(result.keys).toHaveLength(2);
      expect(result.keys).toEqual(
        expect.arrayContaining([
          { label: "key1", key: "uuid1" },
          { label: "key2", key: "uuid2" },
        ])
      );
      expect(result.current).toBe("current-uuid");
    });

    test("should return empty keys array when no keys stored", () => {
      mockDocumentProperties._store["HEVY_API_KEY"] = "current-uuid";

      const result = getApiKeyDataForUI();

      expect(result.keys).toEqual([]);
      expect(result.current).toBe("current-uuid");
    });

    test("should throw ConfigurationError if not developer", () => {
      isDeveloper.mockReturnValue(false);

      expect(() => getApiKeyDataForUI()).toThrow(ConfigurationError);
    });
  });
});
