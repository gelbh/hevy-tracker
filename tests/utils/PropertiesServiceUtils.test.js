/**
 * Tests for PropertiesServiceUtils.gs - Properties service access utilities
 */

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

global.PropertiesService = {
  getUserProperties: jest.fn(() => mockUserProperties),
  getDocumentProperties: jest.fn(() => mockDocumentProperties),
};

// Mock SpreadsheetApp
const mockSpreadsheet = {
  getId: jest.fn(() => "spreadsheet-123"),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock console
global.console = {
  error: jest.fn(),
};

// Mock functions
const getPropertiesSafely = (serviceGetter, serviceName) => {
  try {
    return serviceGetter();
  } catch (error) {
    console.error(`Failed to get ${serviceName}:`, error);
    return null;
  }
};

let _cachedSpreadsheet = null;

function getActiveSpreadsheet() {
  if (!_cachedSpreadsheet) {
    _cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }
  return _cachedSpreadsheet;
}

const getUserProperties = () =>
  getPropertiesSafely(
    () => PropertiesService.getUserProperties(),
    "user properties"
  );

const getDocumentProperties = () =>
  getPropertiesSafely(
    () => PropertiesService.getDocumentProperties(),
    "document properties"
  );

describe("PropertiesServiceUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _cachedSpreadsheet = null;
  });

  describe("getActiveSpreadsheet", () => {
    test("should return spreadsheet instance", () => {
      const result = getActiveSpreadsheet();

      expect(result).toBe(mockSpreadsheet);
      expect(SpreadsheetApp.getActiveSpreadsheet).toHaveBeenCalledTimes(1);
    });

    test("should cache spreadsheet reference", () => {
      const result1 = getActiveSpreadsheet();
      const result2 = getActiveSpreadsheet();

      expect(result1).toBe(result2);
      expect(SpreadsheetApp.getActiveSpreadsheet).toHaveBeenCalledTimes(1);
    });
  });

  describe("getUserProperties", () => {
    test("should return user properties when available", () => {
      const result = getUserProperties();

      expect(result).toBe(mockUserProperties);
      expect(PropertiesService.getUserProperties).toHaveBeenCalledTimes(1);
    });

    test("should return null when service throws error", () => {
      PropertiesService.getUserProperties.mockImplementationOnce(() => {
        throw new Error("Service unavailable");
      });

      const result = getUserProperties();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        "Failed to get user properties:",
        expect.any(Error)
      );
    });

    test("should handle properties operations", () => {
      const props = getUserProperties();
      props.setProperty("test-key", "test-value");

      expect(props.getProperty("test-key")).toBe("test-value");
    });
  });

  describe("getDocumentProperties", () => {
    test("should return document properties when available", () => {
      const result = getDocumentProperties();

      expect(result).toBe(mockDocumentProperties);
      expect(PropertiesService.getDocumentProperties).toHaveBeenCalledTimes(1);
    });

    test("should return null when service throws error", () => {
      PropertiesService.getDocumentProperties.mockImplementationOnce(() => {
        throw new Error("Service unavailable");
      });

      const result = getDocumentProperties();

      expect(result).toBeNull();
      expect(console.error).toHaveBeenCalledWith(
        "Failed to get document properties:",
        expect.any(Error)
      );
    });

    test("should handle properties operations", () => {
      const props = getDocumentProperties();
      props.setProperty("test-key", "test-value");

      expect(props.getProperty("test-key")).toBe("test-value");
    });
  });
});
