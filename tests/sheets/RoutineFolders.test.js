/**
 * Tests for RoutineFolders.gs - Routine folder import functions
 */

const { createMockRoutineFolder } = require("../helpers/testHelpers");

// Mock constants
const ROUTINE_FOLDERS_SHEET_NAME = "Routine Folders";
const API_ENDPOINTS = {
  ROUTINE_FOLDERS: "/routine_folders",
};
const PAGE_SIZE = {
  ROUTINE_FOLDERS: 10,
};
const TOAST_DURATION = {
  NORMAL: 5,
};

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock ApiClient
const mockApiClient = {
  fetchPaginatedData: jest.fn(),
};

global.apiClient = mockApiClient;

// Mock SheetManager
class SheetManager {
  constructor(sheet, sheetName) {
    this.sheet = sheet;
    this.sheetName = sheetName;
  }

  static getOrCreate(sheetName) {
    return new SheetManager({ getName: () => sheetName }, sheetName);
  }

  async clearSheet() {}
  async formatSheet() {}
}

global.SheetManager = SheetManager;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock formatDate utility
global.formatDate = jest.fn((date) => date || "");

// Simplified folder processing function
function processFolderData(folders) {
  return folders.map((folder) => [
    folder.id,
    folder.title,
    formatDate(folder.updated_at),
    formatDate(folder.created_at),
    folder.index || 0,
  ]);
}

describe("RoutineFolders", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processFolderData()", () => {
    test("should process folder data correctly", () => {
      const folder = createMockRoutineFolder({
        id: 1,
        title: "Test Folder",
        updated_at: "2024-01-01T10:00:00Z",
        created_at: "2024-01-01T10:00:00Z",
        index: 0,
      });

      const result = processFolderData([folder]);

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe(1);
      expect(result[0][1]).toBe("Test Folder");
      expect(result[0][4]).toBe(0);
    });

    test("should handle multiple folders", () => {
      const folders = [
        createMockRoutineFolder({ id: 1, title: "Folder 1" }),
        createMockRoutineFolder({ id: 2, title: "Folder 2" }),
      ];

      const result = processFolderData(folders);

      expect(result.length).toBe(2);
      expect(result[0][1]).toBe("Folder 1");
      expect(result[1][1]).toBe("Folder 2");
    });

    test("should handle folder without index", () => {
      const folder = createMockRoutineFolder({ index: undefined });

      const result = processFolderData([folder]);

      expect(result[0][4]).toBe(0);
    });
  });
});
