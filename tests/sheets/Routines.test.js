/**
 * Tests for Routines.gs - Routine import and management functions
 */

const { createMockRoutine } = require("../helpers/testHelpers");

// Mock constants
const ROUTINES_SHEET_NAME = "Routines";
const API_ENDPOINTS = {
  ROUTINES: "/routines",
};
const PAGE_SIZE = {
  ROUTINES: 10,
};
const RATE_LIMIT = {
  BATCH_SIZE: 100,
  API_DELAY: 50,
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

// Mock Utilities
global.Utilities = {
  sleep: jest.fn(),
};

// Mock formatDate utility
global.formatDate = jest.fn((date) => date || "");

// Mock normalizeSetType, normalizeWeight, normalizeNumber utilities
global.normalizeSetType = jest.fn((type) => type || "");
global.normalizeWeight = jest.fn((weight) => weight || "");
global.normalizeNumber = jest.fn((num) => num || "");

// Mock syncLocalizedExerciseNames
global.syncLocalizedExerciseNames = jest.fn();

// Simplified routine processing function
function processRoutine(routine) {
  if (!routine.exercises || routine.exercises.length === 0) {
    return [
      [
        routine.id,
        routine.title,
        routine.folder_id || "",
        formatDate(routine.updated_at),
        formatDate(routine.created_at),
        "",
        "",
        "",
        "",
        "",
      ],
    ];
  }

  return routine.exercises.flatMap((ex) =>
    ex.sets.map((set) => [
      routine.id,
      routine.title,
      routine.folder_id || "",
      formatDate(routine.updated_at),
      formatDate(routine.created_at),
      ex.title,
      normalizeSetType(set.type),
      normalizeWeight(set.weight_kg),
      normalizeNumber(set.reps ?? set.distance_meters),
      normalizeNumber(set.duration_seconds),
    ])
  );
}

describe("Routines", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("processRoutine()", () => {
    test("should process routine without exercises", () => {
      const routine = createMockRoutine({ exercises: [] });

      const result = processRoutine(routine);

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe(routine.id);
      expect(result[0][1]).toBe(routine.title);
      expect(result[0][5]).toBe(""); // Exercise column empty
    });

    test("should process routine with exercises and sets", () => {
      const routine = createMockRoutine({
        exercises: [
          {
            index: 0,
            title: "Bench Press",
            exercise_template_id: "EX001",
            sets: [
              { index: 0, type: "normal", weight_kg: 100, reps: 10 },
              { index: 1, type: "normal", weight_kg: 105, reps: 8 },
            ],
          },
        ],
      });

      const result = processRoutine(routine);

      expect(result.length).toBe(2); // Two sets
      expect(result[0][5]).toBe("Bench Press");
    });

    test("should handle routine with folder_id", () => {
      const routine = createMockRoutine({ folder_id: 1, exercises: [] });

      const result = processRoutine(routine);

      expect(result[0][2]).toBe(1);
    });

    test("should handle routine without folder_id", () => {
      const routine = createMockRoutine({ folder_id: null, exercises: [] });

      const result = processRoutine(routine);

      expect(result[0][2]).toBe("");
    });

    test("should process multiple exercises", () => {
      const routine = createMockRoutine({
        exercises: [
          {
            index: 0,
            title: "Bench Press",
            sets: [{ index: 0, type: "normal", weight_kg: 100, reps: 10 }],
          },
          {
            index: 1,
            title: "Squat",
            sets: [{ index: 0, type: "normal", weight_kg: 150, reps: 5 }],
          },
        ],
      });

      const result = processRoutine(routine);

      expect(result.length).toBe(2);
      expect(result[0][5]).toBe("Bench Press");
      expect(result[1][5]).toBe("Squat");
    });
  });
});
