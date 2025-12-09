/**
 * Tests for Exercises.gs - Exercise import functions
 * Note: Exercise count and localization functions are tested separately
 */

const { createMockExercise } = require("../helpers/testHelpers");

// Mock constants
const EXERCISES_SHEET_NAME = "Exercises";
const TEMPLATE_SPREADSHEET_ID = "template-123";
const API_ENDPOINTS = {
  EXERCISES: "/exercise_templates",
};
const PAGE_SIZE = {
  EXERCISES: 100,
};
const TOAST_DURATION = {
  NORMAL: 5,
};
const SHEET_HEADERS = {
  [EXERCISES_SHEET_NAME]: [
    "ID",
    "Title",
    "IMG",
    "Type",
    "Primary Muscle Group",
    "Secondary Muscle Groups",
    "Is Custom",
    "Count",
    "Rank",
  ],
};

global.EXERCISES_SHEET_NAME = EXERCISES_SHEET_NAME;
global.TEMPLATE_SPREADSHEET_ID = TEMPLATE_SPREADSHEET_ID;
global.API_ENDPOINTS = API_ENDPOINTS;
global.PAGE_SIZE = PAGE_SIZE;
global.TOAST_DURATION = TOAST_DURATION;
global.SHEET_HEADERS = SHEET_HEADERS;

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

// Mock ConfigurationError
class ConfigurationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.context = context;
  }
}

global.ConfigurationError = ConfigurationError;

// Mock SheetManager
class SheetManager {
  constructor(sheet, sheetName) {
    this.sheet = sheet;
    this.sheetName = sheetName;
  }

  static getOrCreate(sheetName) {
    return new SheetManager({ getName: () => sheetName }, sheetName);
  }

  async formatSheet() {}
}

global.SheetManager = SheetManager;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
  getId: jest.fn(() => "spreadsheet-123"),
  getSheetByName: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock getEnglishName utility
global.getEnglishName = jest.fn((name) => name);

// Mock toTitleCaseFromSnake and arrayToTitleCase utilities
global.toTitleCaseFromSnake = jest.fn((str) => str);
global.arrayToTitleCase = jest.fn((arr) => arr.join(", "));

// Mock updateExerciseCounts (called by handlePostProcessing)
global.updateExerciseCounts = jest.fn().mockResolvedValue(undefined);

// Simplified exercise functions for testing
function processExercisesData(exercises) {
  try {
    const isTemplate =
      SpreadsheetApp.getActiveSpreadsheet().getId() === TEMPLATE_SPREADSHEET_ID;
    return exercises.map((exercise) => [
      isTemplate ? "" : exercise.id,
      exercise.title,
      "", // IMG
      exercise.type || "",
      toTitleCaseFromSnake(exercise.primary_muscle_group),
      arrayToTitleCase(exercise.secondary_muscle_groups),
      exercise.is_custom ? "TRUE" : "FALSE",
      0, // Count
      "", // Rank
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing exercise data",
      exerciseCount: exercises.length,
    });
  }
}

function shouldSkipExercise(exercise, existingData) {
  if (exercise.id && existingData.byId.has(exercise.id)) {
    return true;
  }

  const titleKey = exercise.title.toLowerCase();
  if (existingData.byTitle.has(titleKey)) {
    return true;
  }

  const englishTitle = getEnglishName(exercise.title);
  if (englishTitle !== exercise.title) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (existingData.byTitle.has(englishTitleKey)) {
      return true;
    }
  }

  return false;
}

function getExistingExercises(sheet) {
  try {
    const existingDataById = new Map();
    const existingDataByTitle = new Map();

    if (sheet.getLastRow() <= 1) {
      return {
        byId: existingDataById,
        byTitle: existingDataByTitle,
      };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const indices = {
      id: headers.indexOf("ID"),
      title: headers.indexOf("Title"),
      rank: headers.indexOf("Rank"),
    };

    data.forEach((row) => {
      const id = String(row[indices.id] || "").trim();
      const title = String(row[indices.title] || "").trim();
      const hasRank = row[indices.rank] !== "";

      const exerciseData = { id, title, hasRank };

      if (id && id !== "N/A") {
        existingDataById.set(id, exerciseData);
      }
      if (title) {
        existingDataByTitle.set(title.toLowerCase(), exerciseData);
      }
    });

    return {
      byId: existingDataById,
      byTitle: existingDataByTitle,
    };
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting existing exercises",
      sheetName: sheet.getName(),
    });
  }
}

function validateExerciseSheetHeaders(headers, requiredHeaders) {
  const missingHeaders = requiredHeaders.filter(
    (header) => headers.indexOf(header) === -1
  );

  if (missingHeaders.length > 0) {
    const expectedHeaders = SHEET_HEADERS[EXERCISES_SHEET_NAME].join(", ");
    throw new ConfigurationError(
      `Missing required column headers in Exercises sheet: ${missingHeaders.join(
        ", "
      )}. ` +
        `Expected headers: ${expectedHeaders}. ` +
        `Please restore the sheet from the template or recreate it with the correct structure.`,
      {
        missingHeaders: missingHeaders,
        expectedHeaders: SHEET_HEADERS[EXERCISES_SHEET_NAME],
        sheetName: EXERCISES_SHEET_NAME,
      }
    );
  }
}

describe("Exercises", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processExercisesData()", () => {
    test("should process exercise data for non-template spreadsheet", () => {
      const exercise = createMockExercise();

      const result = processExercisesData([exercise]);

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe(exercise.id);
      expect(result[0][1]).toBe(exercise.title);
      expect(result[0][6]).toBe("FALSE");
    });

    test("should process exercise data for template spreadsheet", () => {
      mockSpreadsheet.getId.mockReturnValue(TEMPLATE_SPREADSHEET_ID);
      const exercise = createMockExercise();

      const result = processExercisesData([exercise]);

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe(""); // Empty ID for template
    });

    test("should mark custom exercises", () => {
      const exercise = createMockExercise({ is_custom: true });

      const result = processExercisesData([exercise]);

      expect(result[0][6]).toBe("TRUE");
    });

    test("should handle multiple exercises", () => {
      const exercises = [
        createMockExercise({ id: "EX001" }),
        createMockExercise({ id: "EX002" }),
      ];

      const result = processExercisesData(exercises);

      expect(result.length).toBe(2);
    });

    test("should handle errors during processing", () => {
      const invalidExercise = null;

      expect(() => {
        processExercisesData([invalidExercise]);
      }).toThrow();

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("shouldSkipExercise()", () => {
    test("should skip exercise if ID exists", () => {
      const exercise = createMockExercise({ id: "EX001" });
      const existingData = {
        byId: new Map([["EX001", { id: "EX001", title: "Existing" }]]),
        byTitle: new Map(),
      };

      const result = shouldSkipExercise(exercise, existingData);

      expect(result).toBe(true);
    });

    test("should skip exercise if title exists", () => {
      const exercise = createMockExercise({ title: "Bench Press" });
      const existingData = {
        byId: new Map(),
        byTitle: new Map([
          ["bench press", { id: "EX001", title: "Bench Press" }],
        ]),
      };

      const result = shouldSkipExercise(exercise, existingData);

      expect(result).toBe(true);
    });

    test("should skip exercise if English translation exists", () => {
      const exercise = createMockExercise({ title: "Press de Banca" });
      getEnglishName.mockReturnValue("Bench Press");
      const existingData = {
        byId: new Map(),
        byTitle: new Map([
          ["bench press", { id: "EX001", title: "Bench Press" }],
        ]),
      };

      const result = shouldSkipExercise(exercise, existingData);

      expect(result).toBe(true);
    });

    test("should not skip new exercise", () => {
      const exercise = createMockExercise({
        id: "EX999",
        title: "New Exercise",
      });
      const existingData = {
        byId: new Map(),
        byTitle: new Map(),
      };

      const result = shouldSkipExercise(exercise, existingData);

      expect(result).toBe(false);
    });
  });

  describe("getExistingExercises()", () => {
    test("should return empty maps for empty sheet", () => {
      const mockSheet = {
        getLastRow: jest.fn(() => 1),
        getDataRange: jest.fn(),
      };

      const result = getExistingExercises(mockSheet);

      expect(result.byId.size).toBe(0);
      expect(result.byTitle.size).toBe(0);
    });

    test("should build maps from sheet data", () => {
      const mockSheet = {
        getLastRow: jest.fn(() => 3),
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ["ID", "Title", "Rank"],
            ["EX001", "Bench Press", ""],
            ["EX002", "Squat", "1"],
          ]),
        })),
        getName: jest.fn(() => "Exercises"),
      };

      const result = getExistingExercises(mockSheet);

      expect(result.byId.size).toBe(2);
      expect(result.byId.has("EX001")).toBe(true);
      expect(result.byId.has("EX002")).toBe(true);
      expect(result.byTitle.size).toBe(2);
      expect(result.byTitle.has("bench press")).toBe(true);
      expect(result.byTitle.has("squat")).toBe(true);
    });

    test("should handle N/A IDs", () => {
      const mockSheet = {
        getLastRow: jest.fn(() => 2),
        getDataRange: jest.fn(() => ({
          getValues: jest.fn(() => [
            ["ID", "Title", "Rank"],
            ["N/A", "Custom Exercise", ""],
          ]),
        })),
        getName: jest.fn(() => "Exercises"),
      };

      const result = getExistingExercises(mockSheet);

      expect(result.byId.size).toBe(0);
      expect(result.byTitle.size).toBe(1);
    });

    test("should handle errors", () => {
      const mockSheet = {
        getLastRow: jest.fn(() => {
          throw new Error("Sheet error");
        }),
        getName: jest.fn(() => "Exercises"),
      };

      expect(() => {
        getExistingExercises(mockSheet);
      }).toThrow();

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("validateExerciseSheetHeaders()", () => {
    test("should not throw for valid headers", () => {
      const headers = ["ID", "Title", "Count"];
      const requiredHeaders = ["ID", "Title"];

      expect(() => {
        validateExerciseSheetHeaders(headers, requiredHeaders);
      }).not.toThrow();
    });

    test("should throw ConfigurationError for missing headers", () => {
      const headers = ["ID", "Title"];
      const requiredHeaders = ["ID", "Title", "Count"];

      expect(() => {
        validateExerciseSheetHeaders(headers, requiredHeaders);
      }).toThrow(ConfigurationError);
    });

    test("should include missing headers in error message", () => {
      const headers = ["ID"];
      const requiredHeaders = ["ID", "Title", "Count"];

      try {
        validateExerciseSheetHeaders(headers, requiredHeaders);
        fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect(error.message).toContain("Title");
        expect(error.message).toContain("Count");
        expect(error.context.missingHeaders).toContain("Title");
        expect(error.context.missingHeaders).toContain("Count");
      }
    });
  });
});
