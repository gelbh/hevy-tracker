/**
 * Tests for ExerciseCounts.gs - Exercise count update functions
 */

// Mock constants
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const BATCH_CONFIG = {
  EXERCISE_COUNT_BATCH_SIZE: 100,
};
const RATE_LIMIT = {
  API_DELAY: 50,
};

global.WORKOUTS_SHEET_NAME = WORKOUTS_SHEET_NAME;
global.EXERCISES_SHEET_NAME = EXERCISES_SHEET_NAME;
global.BATCH_CONFIG = BATCH_CONFIG;
global.RATE_LIMIT = RATE_LIMIT;

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    error.errorId = "test-error-id";
    return error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock ConfigurationError
class ConfigurationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.context = context;
  }
}

global.ConfigurationError = ConfigurationError;

// Mock ImportTimeoutError
class ImportTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportTimeoutError";
  }
}

global.ImportTimeoutError = ImportTimeoutError;

// Mock ImportProgressTracker
const mockImportProgressTracker = {
  markOperationComplete: jest.fn(),
  markDeferredOperation: jest.fn(),
};

global.ImportProgressTracker = mockImportProgressTracker;

// Mock Utilities
global.Utilities = {
  sleep: jest.fn(),
};

// Mock getActiveSpreadsheet
const mockSpreadsheet = {
  getSheetByName: jest.fn(),
};

global.getActiveSpreadsheet = jest.fn(() => mockSpreadsheet);

// Mock getEnglishName utility
global.getEnglishName = jest.fn((name) => name);

// Mock validateExerciseSheetHeaders
global.validateExerciseSheetHeaders = jest.fn();

// Simplified functions for testing
function buildExerciseMaps(exerciseSheet) {
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseHeaders = exerciseData.shift();

  validateExerciseSheetHeaders(exerciseHeaders, ["ID", "Title", "Count"]);

  const idIndex = exerciseHeaders.indexOf("ID");
  const titleIndex = exerciseHeaders.indexOf("Title");
  const countIndex = exerciseHeaders.indexOf("Count");

  const idToTitleMap = new Map();
  const titleToIdMap = new Map();

  exerciseData.forEach((row) => {
    const id = String(row[idIndex] || "").trim();
    const title = String(row[titleIndex] || "").trim();

    if (id && id !== "N/A") {
      idToTitleMap.set(id, title);
    }
    if (title) {
      titleToIdMap.set(title.toLowerCase(), id);
    }
  });

  return {
    exerciseData,
    idToTitleMap,
    titleToIdMap,
    indices: { idIndex, titleIndex, countIndex },
  };
}

function buildWorkoutMaps(workoutSheet) {
  const workoutData = workoutSheet.getDataRange().getValues();
  const workoutHeaders = workoutData.shift();
  const indices = {
    workoutId: workoutHeaders.indexOf("ID"),
    exercise: workoutHeaders.indexOf("Exercise"),
    exerciseTemplateId: workoutHeaders.indexOf("Exercise Template ID"),
  };

  return { workoutData, workoutIndices: indices };
}

function incrementTitleCount(
  exerciseTitle,
  titleToIdMap,
  exerciseCountsByTitle
) {
  const titleKey = exerciseTitle.toLowerCase();

  if (titleToIdMap.has(titleKey)) {
    exerciseCountsByTitle.set(
      exerciseTitle,
      (exerciseCountsByTitle.get(exerciseTitle) || 0) + 1
    );
    return;
  }

  const englishTitle = getEnglishName(exerciseTitle);
  if (englishTitle !== exerciseTitle) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (titleToIdMap.has(englishTitleKey)) {
      exerciseCountsByTitle.set(
        englishTitle,
        (exerciseCountsByTitle.get(englishTitle) || 0) + 1
      );
      return;
    }
  }

  exerciseCountsByTitle.set(
    exerciseTitle,
    (exerciseCountsByTitle.get(exerciseTitle) || 0) + 1
  );
}

function checkAndThrowTimeout(checkTimeout, operationName, context = "") {
  if (checkTimeout && checkTimeout()) {
    ImportProgressTracker.markDeferredOperation(operationName);
    const message = context
      ? `Timeout approaching during ${operationName}: ${context}`
      : `Timeout approaching during ${operationName}`;
    throw new ImportTimeoutError(message);
  }
}

describe("ExerciseCounts", () => {
  let mockExerciseSheet;
  let mockWorkoutSheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExerciseSheet = {
      getName: jest.fn(() => "Exercises"),
      getDataRange: jest.fn(),
    };
    mockWorkoutSheet = {
      getDataRange: jest.fn(),
    };
    mockSpreadsheet.getSheetByName.mockReturnValue(mockWorkoutSheet);
  });

  describe("buildExerciseMaps()", () => {
    test("should build maps from exercise sheet data", () => {
      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Title", "Count"],
          ["EX001", "Bench Press", 5],
          ["EX002", "Squat", 3],
        ]),
      });

      const result = buildExerciseMaps(mockExerciseSheet);

      expect(result.idToTitleMap.size).toBe(2);
      expect(result.idToTitleMap.get("EX001")).toBe("Bench Press");
      expect(result.titleToIdMap.size).toBe(2);
      expect(result.titleToIdMap.get("bench press")).toBe("EX001");
      expect(result.indices.idIndex).toBe(0);
      expect(result.indices.titleIndex).toBe(1);
      expect(result.indices.countIndex).toBe(2);
    });

    test("should skip N/A IDs", () => {
      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Title", "Count"],
          ["N/A", "Custom Exercise", 0],
        ]),
      });

      const result = buildExerciseMaps(mockExerciseSheet);

      expect(result.idToTitleMap.size).toBe(0);
      expect(result.titleToIdMap.size).toBe(1);
    });

    test("should validate headers", () => {
      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [["ID", "Title"]]),
      });

      buildExerciseMaps(mockExerciseSheet);

      expect(validateExerciseSheetHeaders).toHaveBeenCalledWith(
        ["ID", "Title"],
        ["ID", "Title", "Count"]
      );
    });
  });

  describe("buildWorkoutMaps()", () => {
    test("should build maps from workout sheet data", () => {
      mockWorkoutSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Exercise", "Exercise Template ID"],
          ["W001", "Bench Press", "EX001"],
          ["W002", "Squat", "EX002"],
        ]),
      });

      const result = buildWorkoutMaps(mockWorkoutSheet);

      expect(result.workoutData.length).toBe(2);
      expect(result.workoutIndices.workoutId).toBe(0);
      expect(result.workoutIndices.exercise).toBe(1);
      expect(result.workoutIndices.exerciseTemplateId).toBe(2);
    });
  });

  describe("incrementTitleCount()", () => {
    test("should increment count for existing title", () => {
      const titleToIdMap = new Map([["bench press", "EX001"]]);
      const exerciseCountsByTitle = new Map();

      incrementTitleCount("Bench Press", titleToIdMap, exerciseCountsByTitle);

      expect(exerciseCountsByTitle.get("Bench Press")).toBe(1);
    });

    test("should handle English translation fallback", () => {
      const titleToIdMap = new Map([["bench press", "EX001"]]);
      const exerciseCountsByTitle = new Map();
      getEnglishName.mockReturnValue("Bench Press");

      incrementTitleCount(
        "Press de Banca",
        titleToIdMap,
        exerciseCountsByTitle
      );

      expect(exerciseCountsByTitle.get("Bench Press")).toBe(1);
    });

    test("should increment count for new exercise", () => {
      const titleToIdMap = new Map();
      const exerciseCountsByTitle = new Map();

      incrementTitleCount("New Exercise", titleToIdMap, exerciseCountsByTitle);

      expect(exerciseCountsByTitle.get("New Exercise")).toBe(1);
    });
  });

  describe("checkAndThrowTimeout()", () => {
    test("should not throw if checkTimeout returns false", () => {
      const checkTimeout = jest.fn(() => false);

      expect(() => {
        checkAndThrowTimeout(checkTimeout, "testOperation");
      }).not.toThrow();
    });

    test("should throw ImportTimeoutError if checkTimeout returns true", () => {
      const checkTimeout = jest.fn(() => true);

      expect(() => {
        checkAndThrowTimeout(checkTimeout, "testOperation");
      }).toThrow(ImportTimeoutError);

      expect(
        mockImportProgressTracker.markDeferredOperation
      ).toHaveBeenCalledWith("testOperation");
    });

    test("should include context in error message", () => {
      const checkTimeout = jest.fn(() => true);

      try {
        checkAndThrowTimeout(checkTimeout, "testOperation", "test context");
        fail("Should have thrown");
      } catch (error) {
        expect(error.message).toContain("testOperation");
        expect(error.message).toContain("test context");
      }
    });

    test("should handle null checkTimeout", () => {
      expect(() => {
        checkAndThrowTimeout(null, "testOperation");
      }).not.toThrow();
    });
  });
});
