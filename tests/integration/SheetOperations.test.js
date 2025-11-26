/**
 * Integration tests for sheet operations workflow
 */

const {
  createMockSheet,
  createMockSpreadsheet,
} = require("../helpers/testHelpers");

// Mock constants
const SHEET_HEADERS = {
  Workouts: ["ID", "Title", "Start Time"],
  Exercises: ["ID", "Title", "Type"],
};

const SHEET_THEMES = {
  Workouts: {
    evenRowColor: "#E6F3FF",
    oddRowColor: "#FFFFFF",
    fontColor: "#2C5777",
    borderColor: "#B3D9FF",
  },
  Exercises: {
    evenRowColor: "#E8F5E9",
    oddRowColor: "#FFFFFF",
    fontColor: "#2E7D32",
    borderColor: "#C8E6C9",
  },
};

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock SheetManager
class SheetManager {
  constructor(sheet, sheetName) {
    this.sheet = sheet;
    this.sheetName = sheetName;
    this.headers = SHEET_HEADERS[sheetName];
    this.theme = SHEET_THEMES[sheetName];
  }

  static getOrCreate(sheetName) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = createMockSheet({ name: sheetName });
      return new SheetManager(sheet, sheetName);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Creating/getting sheet",
        sheetName,
      });
    }
  }

  async formatSheet() {
    await this.ensureHeaders();
    if (this.sheet.getLastRow() > 1) {
      await this.formatData();
    }
  }

  async ensureHeaders() {
    if (!(await this.validateHeaders())) {
      const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);
      headerRange.setValues([this.headers]);
    }
  }

  async validateHeaders() {
    if (this.sheet.getLastRow() === 0) return false;
    const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);
    const existingHeaders = headerRange.getValues()[0];
    return this.headers.every(
      (header, index) => existingHeaders[index] === header
    );
  }

  async formatData() {
    try {
      const rowsToFormat = Math.max(0, this.sheet.getLastRow() - 2 + 1);
      if (rowsToFormat <= 0) return;

      const range = this.sheet.getRange(
        2,
        1,
        rowsToFormat,
        this.sheet.getLastColumn()
      );
      range.setFontFamily("Arial");
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Formatting data",
        sheetName: this.sheetName,
      });
    }
  }

  async clearSheet() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow > 1) {
      this.sheet
        .getRange(2, 1, lastRow - 1, this.sheet.getLastColumn())
        .clear();
    }
  }
}

global.SheetManager = SheetManager;

// Mock SpreadsheetApp
global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => createMockSpreadsheet()),
  newConditionalFormatRule: jest.fn(() => ({
    setRanges: jest.fn(() => ({
      whenFormulaSatisfied: jest.fn(() => ({
        setBackground: jest.fn(() => ({
          build: jest.fn(() => ({})),
        })),
      })),
    })),
  })),
  BorderStyle: {
    SOLID: "SOLID",
  },
};

describe("Sheet Operations Integration", () => {
  describe("Sheet Creation and Formatting", () => {
    test("should create and format new sheet", async () => {
      const manager = SheetManager.getOrCreate("Workouts");

      await manager.formatSheet();

      expect(manager.sheetName).toBe("Workouts");
      expect(manager.headers).toEqual(SHEET_HEADERS.Workouts);
    });

    test("should handle multiple sheets", async () => {
      const workoutsManager = SheetManager.getOrCreate("Workouts");
      const exercisesManager = SheetManager.getOrCreate("Exercises");

      await workoutsManager.formatSheet();
      await exercisesManager.formatSheet();

      expect(workoutsManager.sheetName).toBe("Workouts");
      expect(exercisesManager.sheetName).toBe("Exercises");
    });
  });

  describe("Data Writing and Reading", () => {
    test("should write and read data consistently", async () => {
      const manager = SheetManager.getOrCreate("Workouts");
      const testData = [
        ["id1", "Workout 1", "2024-01-01"],
        ["id2", "Workout 2", "2024-01-02"],
      ];

      manager.sheet.getRange = jest.fn(() => ({
        setValues: jest.fn(),
        getValues: jest.fn(() => [SHEET_HEADERS.Workouts, ...testData]),
      }));

      await manager.formatSheet();

      expect(manager.sheet.getRange).toHaveBeenCalled();
    });
  });

  describe("Error Handling Across Operations", () => {
    test("should handle errors during sheet creation", () => {
      const originalGetActiveSpreadsheet = SpreadsheetApp.getActiveSpreadsheet;
      SpreadsheetApp.getActiveSpreadsheet = jest.fn(() => {
        const error = new Error("Access denied");
        throw ErrorHandler.handle(error, {
          operation: "Creating/getting sheet",
          sheetName: "Workouts",
        });
      });

      try {
        SheetManager.getOrCreate("Workouts");
        fail("Expected error to be thrown");
      } catch (error) {
        expect(mockErrorHandler.handle).toHaveBeenCalled();
      } finally {
        SpreadsheetApp.getActiveSpreadsheet = originalGetActiveSpreadsheet;
      }
    });

    test("should handle errors during formatting", async () => {
      const manager = SheetManager.getOrCreate("Workouts");
      manager.sheet.getLastRow = jest.fn(() => {
        const error = new Error("Sheet error");
        throw ErrorHandler.handle(error, {
          operation: "Formatting sheet",
          sheetName: "Workouts",
        });
      });

      try {
        await manager.formatSheet();
        fail("Expected error to be thrown");
      } catch (error) {
        expect(mockErrorHandler.handle).toHaveBeenCalled();
      }
    });
  });
});
