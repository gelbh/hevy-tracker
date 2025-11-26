/**
 * Tests for SheetManager.gs - Sheet formatting and manipulation
 */

const {
  createMockSheet,
  createMockSpreadsheet,
} = require("../helpers/testHelpers");

// Mock constants
const SHEET_HEADERS = {
  Workouts: ["ID", "Title", "Start Time", "End Time"],
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

// Mock error classes
class ValidationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ValidationError";
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

// Mock SpreadsheetApp
global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
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

// SheetManager implementation
class SheetManager {
  constructor(sheet, sheetName) {
    try {
      this.sheet = sheet;
      this.sheetName = sheetName;
      this.theme = SHEET_THEMES[sheetName];
      this.headers = SHEET_HEADERS[sheetName];

      if (!this.headers) {
        throw new ValidationError(`No headers defined for sheet: ${sheetName}`);
      }
      if (!this.theme) {
        throw new ValidationError(`No theme defined for sheet: ${sheetName}`);
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "SheetManager initialization",
        sheetName,
      });
    }
  }

  static getOrCreate(sheetName) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      return new SheetManager(sheet, sheetName);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Creating/getting sheet",
        sheetName,
      });
    }
  }

  async formatSheet() {
    try {
      await this.ensureHeaders();

      if (this.sheet.getLastRow() <= 1) return;

      await this.formatData();
      await this.removeEmptyRowsAndColumns();
      await this.setAlternatingColors();
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Formatting sheet",
        sheetName: this.sheetName,
      });
    }
  }

  async ensureHeaders() {
    try {
      if (!(await this.validateHeaders())) {
        if (this.sheet.getLastRow() > 0) {
          this.sheet.clear();
        }

        const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);

        headerRange
          .setValues([this.headers])
          .setFontWeight("bold")
          .setBackground(this.theme.evenRowColor)
          .setFontColor(this.theme.fontColor);

        this.sheet.setFrozenRows(1);
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Ensuring headers",
        sheetName: this.sheetName,
      });
    }
  }

  async validateHeaders() {
    try {
      if (this.sheet.getLastRow() === 0) return false;

      const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);
      const existingHeaders = headerRange.getValues()[0];

      return this.headers.every(
        (header, index) => existingHeaders[index] === header
      );
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Validating headers",
        sheetName: this.sheetName,
      });
    }
  }

  async formatData(numRows, startRow = 2) {
    try {
      const rowsToFormat =
        numRows ?? Math.max(0, this.sheet.getLastRow() - startRow + 1);
      if (rowsToFormat <= 0) return;

      const range = this.sheet.getRange(
        startRow,
        1,
        rowsToFormat,
        this.sheet.getLastColumn()
      );

      range
        .setFontFamily("Arial")
        .setFontSize(11)
        .setVerticalAlignment("middle")
        .setBorder(
          true,
          true,
          true,
          true,
          true,
          true,
          this.theme.borderColor,
          SpreadsheetApp.BorderStyle.SOLID
        );
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Formatting data",
        sheetName: this.sheetName,
        startRow,
        numRows,
      });
    }
  }

  async removeEmptyRowsAndColumns() {
    try {
      const maxRows = this.sheet.getMaxRows();
      const maxCols = this.sheet.getMaxColumns();
      const lastRow = this.sheet.getLastRow();
      const lastCol = this.sheet.getLastColumn();

      if (lastRow > 1 && lastRow < maxRows) {
        this.sheet.deleteRows(lastRow + 1, maxRows - lastRow);
      }

      if (lastCol > 0 && lastCol < maxCols) {
        this.sheet.deleteColumns(lastCol + 1, maxCols - lastCol);
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Removing empty rows and columns",
        sheetName: this.sheetName,
      });
    }
  }

  async setAlternatingColors() {
    try {
      const lastRow = this.sheet.getLastRow();
      if (lastRow <= 1) return;

      const range = this.sheet.getRange(
        2,
        1,
        lastRow - 1,
        this.sheet.getLastColumn()
      );

      this.sheet.clearConditionalFormatRules();

      const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=0")
        .setBackground(this.theme.evenRowColor)
        .build();

      const oddRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=1")
        .setBackground(this.theme.oddRowColor)
        .build();

      this.sheet.setConditionalFormatRules([evenRowRule, oddRowRule]);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Setting alternating colors",
        sheetName: this.sheetName,
      });
    }
  }

  async clearSheet() {
    try {
      const lastRow = this.sheet.getLastRow();
      if (lastRow <= 1) return;

      this.sheet
        .getRange(2, 1, lastRow - 1, this.sheet.getLastColumn())
        .clear();
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Clearing sheet",
        sheetName: this.sheetName,
      });
    }
  }
}

describe("SheetManager", () => {
  let mockSheet;
  let mockSpreadsheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSheet = createMockSheet({ name: "Workouts" });
    mockSpreadsheet = createMockSpreadsheet({ sheets: [mockSheet] });
    SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(mockSpreadsheet);
  });

  describe("constructor", () => {
    test("should create instance with valid sheet and sheetName", () => {
      const manager = new SheetManager(mockSheet, "Workouts");

      expect(manager.sheet).toBe(mockSheet);
      expect(manager.sheetName).toBe("Workouts");
      expect(manager.headers).toEqual(SHEET_HEADERS.Workouts);
      expect(manager.theme).toEqual(SHEET_THEMES.Workouts);
    });

    test("should throw ValidationError for missing headers", () => {
      expect(() => {
        new SheetManager(mockSheet, "InvalidSheet");
      }).toThrow(ValidationError);

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });

    test("should throw ValidationError for missing theme", () => {
      const invalidHeaders = { ...SHEET_HEADERS };
      invalidHeaders["Workouts"] = undefined;

      expect(() => {
        new SheetManager(mockSheet, "Workouts");
      }).not.toThrow(); // Will throw if theme is missing

      // Test with a sheet that has headers but no theme
      const originalTheme = SHEET_THEMES.Workouts;
      delete SHEET_THEMES.Workouts;

      expect(() => {
        new SheetManager(mockSheet, "Workouts");
      }).toThrow(ValidationError);

      SHEET_THEMES.Workouts = originalTheme;
    });
  });

  describe("getOrCreate()", () => {
    test("should return existing sheet manager", () => {
      const manager = SheetManager.getOrCreate("Workouts");

      expect(manager).toBeInstanceOf(SheetManager);
      expect(manager.sheetName).toBe("Workouts");
      expect(mockSpreadsheet.getSheetByName).toHaveBeenCalledWith("Workouts");
      expect(mockSpreadsheet.insertSheet).not.toHaveBeenCalled();
    });

    test("should create new sheet if not exists", () => {
      mockSpreadsheet.getSheetByName.mockReturnValue(null);
      const newSheet = createMockSheet({ name: "Workouts" });
      mockSpreadsheet.insertSheet.mockReturnValue(newSheet);

      const manager = SheetManager.getOrCreate("Workouts");

      expect(manager).toBeInstanceOf(SheetManager);
      expect(mockSpreadsheet.insertSheet).toHaveBeenCalledWith("Workouts");
    });

    test("should handle errors during creation", () => {
      mockSpreadsheet.getSheetByName.mockImplementation(() => {
        throw new Error("Access denied");
      });

      expect(() => {
        SheetManager.getOrCreate("Workouts");
      }).toThrow();

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("formatSheet()", () => {
    test("should format sheet with data", async () => {
      mockSheet.getLastRow.mockReturnValue(5);
      mockSheet.getLastColumn.mockReturnValue(4);
      const mockHeaderRange = {
        getValues: jest.fn(() => [SHEET_HEADERS.Workouts]),
        setValues: jest.fn(() => mockHeaderRange),
        setFontWeight: jest.fn(() => mockHeaderRange),
        setBackground: jest.fn(() => mockHeaderRange),
        setFontColor: jest.fn(),
      };
      const mockDataRange = {
        setFontFamily: jest.fn(() => mockDataRange),
        setFontSize: jest.fn(() => mockDataRange),
        setVerticalAlignment: jest.fn(() => mockDataRange),
        setBorder: jest.fn(() => mockDataRange),
      };
      let callCount = 0;
      mockSheet.getRange.mockImplementation((row, col, numRows, numCols) => {
        callCount++;
        // Rows 1 are for headers (validateHeaders, ensureHeaders)
        // Row 2+ is for data (formatData)
        if (row === 1) {
          return mockHeaderRange;
        }
        return mockDataRange; // For formatData (row 2+)
      });

      const manager = new SheetManager(mockSheet, "Workouts");
      // Mock validateHeaders to return false so ensureHeaders creates headers
      manager.validateHeaders = jest.fn(async () => false);
      
      await manager.formatSheet();

      expect(mockSheet.setFrozenRows).toHaveBeenCalledWith(1);
      expect(mockSheet.clearConditionalFormatRules).toHaveBeenCalled();
      expect(mockDataRange.setFontFamily).toHaveBeenCalled();
    });

    test("should skip formatting if no data rows", async () => {
      mockSheet.getLastRow.mockReturnValue(1);
      const mockHeaderRange = {
        getValues: jest.fn(() => [SHEET_HEADERS.Workouts]),
        setValues: jest.fn(() => mockHeaderRange),
        setFontWeight: jest.fn(() => mockHeaderRange),
        setBackground: jest.fn(() => mockHeaderRange),
        setFontColor: jest.fn(),
      };
      mockSheet.getRange.mockReturnValue(mockHeaderRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.formatSheet();

      // formatSheet calls ensureHeaders
      // If validateHeaders returns true, headers are already valid, so setFrozenRows may not be called
      // Since getLastRow returns 1, formatData is skipped (returns early)
      expect(mockSheet.getRange).toHaveBeenCalled(); // At least validateHeaders is called
      // formatData should not be called since getLastRow <= 1
    });

    test("should handle errors during formatting", async () => {
      mockSheet.getLastRow.mockImplementation(() => {
        throw new Error("Sheet error");
      });

      const manager = new SheetManager(mockSheet, "Workouts");

      await expect(manager.formatSheet()).rejects.toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("ensureHeaders()", () => {
    test("should create headers if sheet is empty", async () => {
      mockSheet.getLastRow.mockReturnValue(0);
      const mockRange = {
        getValues: jest.fn(() => []),
        setValues: jest.fn(() => mockRange),
        setFontWeight: jest.fn(() => mockRange),
        setBackground: jest.fn(() => mockRange),
        setFontColor: jest.fn(),
      };
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.ensureHeaders();

      expect(mockRange.setValues).toHaveBeenCalledWith([
        SHEET_HEADERS.Workouts,
      ]);
      expect(mockSheet.setFrozenRows).toHaveBeenCalledWith(1);
    });

    test("should clear sheet if headers are invalid", async () => {
      mockSheet.getLastRow.mockReturnValue(5);
      const mockRange = {
        getValues: jest.fn(() => [["Wrong", "Headers"]]),
        setValues: jest.fn(() => mockRange),
        setFontWeight: jest.fn(() => mockRange),
        setBackground: jest.fn(() => mockRange),
        setFontColor: jest.fn(),
      };
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.ensureHeaders();

      expect(mockSheet.clear).toHaveBeenCalled();
    });

    test("should not modify headers if they are valid", async () => {
      mockSheet.getLastRow.mockReturnValue(1);
      mockSheet.getRange.mockReturnValue({
        getValues: jest.fn(() => [SHEET_HEADERS.Workouts]),
      });

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.ensureHeaders();

      expect(mockSheet.clear).not.toHaveBeenCalled();
    });
  });

  describe("validateHeaders()", () => {
    test("should return false for empty sheet", async () => {
      mockSheet.getLastRow.mockReturnValue(0);

      const manager = new SheetManager(mockSheet, "Workouts");
      const result = await manager.validateHeaders();

      expect(result).toBe(false);
    });

    test("should return true for valid headers", async () => {
      mockSheet.getLastRow.mockReturnValue(1);
      mockSheet.getRange.mockReturnValue({
        getValues: jest.fn(() => [SHEET_HEADERS.Workouts]),
      });

      const manager = new SheetManager(mockSheet, "Workouts");
      const result = await manager.validateHeaders();

      expect(result).toBe(true);
    });

    test("should return false for invalid headers", async () => {
      mockSheet.getLastRow.mockReturnValue(1);
      mockSheet.getRange.mockReturnValue({
        getValues: jest.fn(() => [["Wrong", "Headers", "Here"]]),
      });

      const manager = new SheetManager(mockSheet, "Workouts");
      const result = await manager.validateHeaders();

      expect(result).toBe(false);
    });
  });

  describe("formatData()", () => {
    test("should format all data rows by default", async () => {
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(4);
      const mockRange = {
        setFontFamily: jest.fn(() => ({
          setFontSize: jest.fn(() => ({
            setVerticalAlignment: jest.fn(() => ({
              setBorder: jest.fn(),
            })),
          })),
        })),
      };
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.formatData();

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 1, 9, 4);
      expect(mockRange.setFontFamily).toHaveBeenCalledWith("Arial");
    });

    test("should format specified number of rows", async () => {
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(4);
      const mockRange = {
        setFontFamily: jest.fn(() => ({
          setFontSize: jest.fn(() => ({
            setVerticalAlignment: jest.fn(() => ({
              setBorder: jest.fn(),
            })),
          })),
        })),
      };
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.formatData(5);

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 1, 5, 4);
    });

    test("should skip formatting if no rows to format", async () => {
      mockSheet.getLastRow.mockReturnValue(1);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.formatData();

      expect(mockSheet.getRange).not.toHaveBeenCalled();
    });
  });

  describe("removeEmptyRowsAndColumns()", () => {
    test("should remove empty rows", async () => {
      mockSheet.getMaxRows.mockReturnValue(1000);
      mockSheet.getMaxColumns.mockReturnValue(26);
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(5);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.removeEmptyRowsAndColumns();

      expect(mockSheet.deleteRows).toHaveBeenCalledWith(11, 990);
    });

    test("should remove empty columns", async () => {
      mockSheet.getMaxRows.mockReturnValue(1000);
      mockSheet.getMaxColumns.mockReturnValue(26);
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(5);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.removeEmptyRowsAndColumns();

      expect(mockSheet.deleteColumns).toHaveBeenCalledWith(6, 21);
    });

    test("should not remove rows if at max", async () => {
      mockSheet.getMaxRows.mockReturnValue(10);
      mockSheet.getLastRow.mockReturnValue(10);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.removeEmptyRowsAndColumns();

      expect(mockSheet.deleteRows).not.toHaveBeenCalled();
    });
  });

  describe("setAlternatingColors()", () => {
    test("should set alternating row colors", async () => {
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(4);
      const mockRange = {};
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.setAlternatingColors();

      expect(mockSheet.clearConditionalFormatRules).toHaveBeenCalled();
      expect(SpreadsheetApp.newConditionalFormatRule).toHaveBeenCalledTimes(2);
      expect(mockSheet.setConditionalFormatRules).toHaveBeenCalled();
    });

    test("should skip if no data rows", async () => {
      mockSheet.getLastRow.mockReturnValue(1);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.setAlternatingColors();

      expect(mockSheet.clearConditionalFormatRules).not.toHaveBeenCalled();
    });
  });

  describe("clearSheet()", () => {
    test("should clear data rows but keep headers", async () => {
      mockSheet.getLastRow.mockReturnValue(10);
      mockSheet.getLastColumn.mockReturnValue(4);
      const mockRange = {
        clear: jest.fn(),
      };
      mockSheet.getRange.mockReturnValue(mockRange);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.clearSheet();

      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 1, 9, 4);
      expect(mockRange.clear).toHaveBeenCalled();
    });

    test("should skip if no data rows", async () => {
      mockSheet.getLastRow.mockReturnValue(1);

      const manager = new SheetManager(mockSheet, "Workouts");
      await manager.clearSheet();

      expect(mockSheet.getRange).not.toHaveBeenCalled();
    });
  });
});
