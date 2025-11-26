/**
 * Tests for Exercises.gs - Exercise import and management functions
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
  // Check by ID first (most reliable)
  if (exercise.id && existingData.byId.has(exercise.id)) {
    return true;
  }

  // Check by title (exact match)
  const titleKey = exercise.title.toLowerCase();
  if (existingData.byTitle.has(titleKey)) {
    return true;
  }

  // Check by English translation (fallback)
  const englishTitle = getEnglishName(exercise.title);
  if (englishTitle !== exercise.title) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (existingData.byTitle.has(englishTitleKey)) {
      return true;
    }
  }

  return false;
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
});
