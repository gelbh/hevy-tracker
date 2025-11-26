/**
 * Tests for Menu.gs - Menu creation and event handling
 */

// Mock constants
const TEMPLATE_SPREADSHEET_ID = "template-123";

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock SpreadsheetApp
const mockButtonSet = {
  YES_NO: "YES_NO",
  OK: "OK",
};

const mockButton = {
  YES: "YES",
  NO: "NO",
  OK: "OK",
};

const mockMenu = {
  addItem: jest.fn(() => mockMenu),
  addSeparator: jest.fn(() => mockMenu),
  addSubMenu: jest.fn(() => mockMenu),
  addToUi: jest.fn(),
};

const mockSubMenu = {
  addItem: jest.fn(() => mockSubMenu),
  addSeparator: jest.fn(() => mockSubMenu),
};

const mockUi = {
  createAddonMenu: jest.fn(() => mockMenu),
  createMenu: jest.fn(() => mockSubMenu),
  ButtonSet: mockButtonSet,
  Button: mockButton,
};

const mockSpreadsheet = {
  getId: jest.fn(() => "spreadsheet-123"),
};

global.SpreadsheetApp = {
  getUi: jest.fn(() => mockUi),
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock functions
global.isDeveloper = jest.fn(() => false);
global.showInitialSetup = jest.fn();
global.showGuideDialog = jest.fn();
global.showTakeoutDialog = jest.fn();
global.logWeight = jest.fn();
global.createRoutineFromSheet = jest.fn();
global.clearRoutineBuilder = jest.fn();
global.importAllWorkouts = jest.fn();
global.importAllExercises = jest.fn();
global.importAllRoutines = jest.fn();
global.importAllRoutineFolders = jest.fn();
global.showDevApiManagerDialog = jest.fn();

// Mock apiClient
global.apiClient = {
  runFullImport: jest.fn(),
};

// Simplified menu functions
function onInstall(e) {
  try {
    onOpen(e);
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Installing add-on" });
  }
}

function onOpen(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    const addonMenu = ui.createAddonMenu();
    const isTemplate = e?.source?.getId() === TEMPLATE_SPREADSHEET_ID;

    if (isDeveloper()) {
      addonMenu
        .addItem("🔧 Developer API Manager", "showDevApiManagerDialog")
        .addSeparator();
      if (isTemplate) {
        addonMenu
          .addItem("💪 Import Exercises", "importAllExercises")
          .addSeparator();
      }
    }

    if (isTemplate) {
      addonMenu.addItem("❓ View Setup Guide", "showGuideDialog");
    } else {
      addonMenu.addItem("🔑 Set Hevy API Key", "showInitialSetup");
    }

    if (!isTemplate) {
      addonMenu
        .addSeparator()
        .addSubMenu(createImportSubmenu(ui))
        .addSeparator()
        .addSubMenu(createRoutineBuilderSubmenu(ui))
        .addSeparator()
        .addItem("❤️‍🩹 Import Body Weight from Takeout", "showTakeoutDialog")
        .addItem("⚖️ Log Body Weight", "logWeight");
    }

    addonMenu.addToUi();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Opening spreadsheet",
      authMode: e?.authMode,
    });
  }
}

function createImportSubmenu(ui) {
  return ui
    .createMenu("📥 Import Data")
    .addItem("📥 Import All", "apiClient.runFullImport")
    .addSeparator()
    .addItem("🏋️ Import Workouts", "importAllWorkouts")
    .addItem("💪 Import Exercises", "importAllExercises")
    .addItem("📋 Import Routines", "importAllRoutines")
    .addItem("📁 Import Routine Folders", "importAllRoutineFolders");
}

function createRoutineBuilderSubmenu(ui) {
  return ui
    .createMenu("📝 Routine Builder")
    .addItem("📋 Create Routine from Sheet", "createRoutineFromSheet")
    .addItem("🗑️ Clear Builder Form", "clearRoutineBuilder");
}

describe("Menu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("onOpen()", () => {
    test("should create menu for non-template spreadsheet", () => {
      const event = { source: { getId: () => "regular-123" } };

      onOpen(event);

      expect(mockUi.createAddonMenu).toHaveBeenCalled();
      expect(mockMenu.addItem).toHaveBeenCalledWith(
        "🔑 Set Hevy API Key",
        "showInitialSetup"
      );
      expect(mockMenu.addToUi).toHaveBeenCalled();
    });

    test("should create menu for template spreadsheet", () => {
      const event = { source: { getId: () => TEMPLATE_SPREADSHEET_ID } };

      onOpen(event);

      expect(mockMenu.addItem).toHaveBeenCalledWith(
        "❓ View Setup Guide",
        "showGuideDialog"
      );
    });

    test("should add developer menu items when isDeveloper returns true", () => {
      global.isDeveloper.mockReturnValue(true);
      const event = { source: { getId: () => "regular-123" } };

      onOpen(event);

      expect(mockMenu.addItem).toHaveBeenCalledWith(
        "🔧 Developer API Manager",
        "showDevApiManagerDialog"
      );
    });

    test("should create import submenu", () => {
      const event = { source: { getId: () => "regular-123" } };

      onOpen(event);

      expect(mockUi.createMenu).toHaveBeenCalledWith("📥 Import Data");
    });

    test("should handle errors gracefully", () => {
      mockUi.createAddonMenu.mockImplementation(() => {
        throw new Error("Menu creation failed");
      });
      const event = { source: { getId: () => "regular-123" } };

      expect(() => onOpen(event)).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("onInstall()", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Reset mock implementation
      mockUi.createAddonMenu.mockImplementation(() => mockMenu);
    });

    test("should call onOpen", () => {
      const event = { source: { getId: () => "regular-123" } };

      onInstall(event);

      expect(mockUi.createAddonMenu).toHaveBeenCalled();
    });

    test("should handle errors during installation", () => {
      mockUi.createAddonMenu.mockImplementationOnce(() => {
        throw new Error("Installation failed");
      });
      const event = { source: { getId: () => "regular-123" } };

      expect(() => onInstall(event)).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("createImportSubmenu()", () => {
    test("should create import submenu with all items", () => {
      const submenu = createImportSubmenu(mockUi);

      expect(mockUi.createMenu).toHaveBeenCalledWith("📥 Import Data");
      expect(mockSubMenu.addItem).toHaveBeenCalledWith(
        "📥 Import All",
        "apiClient.runFullImport"
      );
    });
  });

  describe("createRoutineBuilderSubmenu()", () => {
    test("should create routine builder submenu", () => {
      const submenu = createRoutineBuilderSubmenu(mockUi);

      expect(mockUi.createMenu).toHaveBeenCalledWith("📝 Routine Builder");
      expect(mockSubMenu.addItem).toHaveBeenCalledWith(
        "📋 Create Routine from Sheet",
        "createRoutineFromSheet"
      );
    });
  });
});
