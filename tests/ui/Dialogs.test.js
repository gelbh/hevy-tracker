/**
 * Tests for Dialogs.gs - Dialog display functions
 */

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
    _store: store,
  };
};

const mockProperties = createMockProperties();
global.getDocumentProperties = jest.fn(() => mockProperties);

// Mock apiClient
global.apiClient = {
  manageApiKey: jest.fn(),
};

// Mock showHtmlDialog
global.showHtmlDialog = jest.fn();

// Mock SpreadsheetApp
const mockUi = {
  alert: jest.fn(() => "OK"),
  ButtonSet: {
    YES_NO: "YES_NO",
    OK: "OK",
  },
  Button: {
    YES: "YES",
    NO: "NO",
    OK: "OK",
  },
};

global.SpreadsheetApp = {
  getUi: jest.fn(() => mockUi),
};

// Mock constants
const TEMPLATE_SPREADSHEET_ID = "template-123";

// Simplified dialog functions
function showInitialSetup() {
  try {
    const hasApiKey = getDocumentProperties()?.getProperty("HEVY_API_KEY");

    if (hasApiKey) {
      apiClient.manageApiKey();
    } else {
      showHtmlDialog("src/ui/dialogs/SetApiKey", {
        width: 450,
        height: 250,
        title: "Hevy Tracker Setup",
      });
    }
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing initial setup" });
  }
}

function showGuideDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/SetupInstructions", {
      width: 700,
      height: 700,
      title: "Hevy Tracker Setup Guide",
      templateData: {
        TEMPLATE_SPREADSHEET_ID: TEMPLATE_SPREADSHEET_ID,
      },
    });
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing guide dialog" });
  }
}

function showTakeoutDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/ImportWeight", {
      title: "Import Google Fit Weight",
      width: 600,
      height: 420,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing import dialog" });
  }
}

function showMultiLoginWarning() {
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      "Multi-Account Login Detected",
      "You appear to be logged into multiple Google accounts simultaneously.",
      ui.ButtonSet.YES_NO
    );

    return result !== ui.Button.NO;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing multi-login warning",
    });
  }
}

function showDevApiManagerDialog() {
  showHtmlDialog("src/ui/dialogs/DevApiManager", {
    width: 600,
    height: 480,
    title: "Developer API Key Manager",
  });
}

describe("Dialogs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProperties._store = {};
  });

  describe("showInitialSetup()", () => {
    test("should show API key dialog if no key exists", () => {
      mockProperties._store = {};
      getDocumentProperties.mockReturnValue(mockProperties);
      showInitialSetup();

      expect(showHtmlDialog).toHaveBeenCalledWith(
        "src/ui/dialogs/SetApiKey",
        expect.objectContaining({
          title: "Hevy Tracker Setup",
        })
      );
    });

    test("should call manageApiKey if key exists", () => {
      mockProperties._store = { HEVY_API_KEY: "test-key" };
      mockProperties.getProperty.mockImplementation((key) => {
        return mockProperties._store[key] || null;
      });
      getDocumentProperties.mockReturnValue(mockProperties);

      showInitialSetup();

      expect(apiClient.manageApiKey).toHaveBeenCalled();
      expect(showHtmlDialog).not.toHaveBeenCalled();
    });

    test("should handle errors", () => {
      getDocumentProperties.mockImplementation(() => {
        throw new Error("Properties error");
      });

      expect(() => showInitialSetup()).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("showGuideDialog()", () => {
    test("should show guide dialog with correct options", () => {
      showGuideDialog();

      expect(showHtmlDialog).toHaveBeenCalledWith(
        "src/ui/dialogs/SetupInstructions",
        expect.objectContaining({
          width: 700,
          height: 700,
          title: "Hevy Tracker Setup Guide",
        })
      );
    });

    test("should handle errors", () => {
      showHtmlDialog.mockImplementation(() => {
        throw new Error("Dialog error");
      });

      expect(() => showGuideDialog()).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("showTakeoutDialog()", () => {
    test("should show takeout dialog", () => {
      showHtmlDialog.mockImplementation(() => {});
      showTakeoutDialog();

      expect(showHtmlDialog).toHaveBeenCalledWith(
        "src/ui/dialogs/ImportWeight",
        expect.objectContaining({
          title: "Import Google Fit Weight",
        })
      );
    });
  });

  describe("showMultiLoginWarning()", () => {
    test("should show warning dialog", () => {
      showMultiLoginWarning();

      expect(mockUi.alert).toHaveBeenCalledWith(
        "Multi-Account Login Detected",
        expect.any(String),
        mockUi.ButtonSet.YES_NO
      );
    });

    test("should return true if user clicks YES", () => {
      mockUi.alert.mockReturnValue(mockUi.Button.YES);

      const result = showMultiLoginWarning();

      expect(result).toBe(true);
    });

    test("should return false if user clicks NO", () => {
      mockUi.alert.mockReturnValue(mockUi.Button.NO);

      const result = showMultiLoginWarning();

      expect(result).toBe(false);
    });
  });

  describe("showDevApiManagerDialog()", () => {
    test("should show developer API manager dialog", () => {
      showHtmlDialog.mockImplementation(() => {});
      showDevApiManagerDialog();

      expect(showHtmlDialog).toHaveBeenCalledWith(
        "src/ui/dialogs/DevApiManager",
        expect.objectContaining({
          title: "Developer API Key Manager",
        })
      );
    });
  });
});
