/**
 * Tests for ExerciseLocalization.gs - Localized exercise name syncing functions
 */

// Mock constants
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const ROUTINES_SHEET_NAME = "Routines";
const BATCH_CONFIG = {
  SHEET_UPDATE_BATCH_SIZE: 100,
};
const RATE_LIMIT = {
  API_DELAY: 50,
};

global.WORKOUTS_SHEET_NAME = WORKOUTS_SHEET_NAME;
global.EXERCISES_SHEET_NAME = EXERCISES_SHEET_NAME;
global.ROUTINES_SHEET_NAME = ROUTINES_SHEET_NAME;
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

// Mock checkAndThrowTimeout
global.checkAndThrowTimeout = jest.fn();

// Simplified functions for testing
function buildLocalizedNameMapFromSheet(workoutSheet) {
  const workoutData = workoutSheet.getDataRange().getValues();
  const workoutHeaders = workoutData.shift();
  const exerciseTemplateIdIndex = workoutHeaders.indexOf(
    "Exercise Template ID"
  );
  const exerciseTitleIndex = workoutHeaders.indexOf("Exercise");

  if (exerciseTemplateIdIndex === -1 || exerciseTitleIndex === -1) {
    return new Map();
  }

  const idToLocalizedName = new Map();

  workoutData.forEach((row) => {
    const exerciseTemplateId = String(
      row[exerciseTemplateIdIndex] || ""
    ).trim();
    const localizedTitle = String(row[exerciseTitleIndex] || "").trim();

    if (exerciseTemplateId && localizedTitle && exerciseTemplateId !== "N/A") {
      idToLocalizedName.set(exerciseTemplateId, localizedTitle);
    }
  });

  return idToLocalizedName;
}

function buildExerciseNameMaps(exerciseSheet, idToLocalizedName) {
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseHeaders = exerciseData.shift();

  validateExerciseSheetHeaders(exerciseHeaders, ["ID", "Title"]);

  const idIndex = exerciseHeaders.indexOf("ID");
  const titleIndex = exerciseHeaders.indexOf("Title");

  const exerciseNameToLocalized = new Map();
  const exerciseUpdates = [];
  const nameToExerciseId = new Map();

  exerciseData.forEach((row, rowIndex) => {
    const exerciseId = String(row[idIndex] || "").trim();
    const currentTitle = String(row[titleIndex] || "").trim();

    if (
      exerciseId &&
      exerciseId !== "N/A" &&
      idToLocalizedName.has(exerciseId)
    ) {
      const localizedName = idToLocalizedName.get(exerciseId);

      if (currentTitle) {
        exerciseNameToLocalized.set(currentTitle.toLowerCase(), localizedName);
      }
      exerciseNameToLocalized.set(localizedName.toLowerCase(), localizedName);

      if (localizedName !== currentTitle) {
        exerciseUpdates.push({
          row: rowIndex + 2,
          value: localizedName,
        });
      }

      const currentTitleKey = currentTitle.toLowerCase();
      if (!nameToExerciseId.has(currentTitleKey)) {
        nameToExerciseId.set(currentTitleKey, exerciseId);
      }
      const localizedKey = localizedName.toLowerCase();
      if (!nameToExerciseId.has(localizedKey)) {
        nameToExerciseId.set(localizedKey, exerciseId);
      }

      const englishTitle = getEnglishName(currentTitle);
      if (englishTitle !== currentTitle) {
        const englishKey = englishTitle.toLowerCase();
        if (!nameToExerciseId.has(englishKey)) {
          nameToExerciseId.set(englishKey, exerciseId);
        }
      }
    } else if (currentTitle) {
      exerciseNameToLocalized.set(currentTitle.toLowerCase(), currentTitle);
      if (!nameToExerciseId.has(currentTitle.toLowerCase())) {
        nameToExerciseId.set(currentTitle.toLowerCase(), exerciseId || "");
      }
    }
  });

  return {
    exerciseData,
    exerciseNameToLocalized,
    nameToExerciseId,
    exerciseUpdates,
    titleIndex,
  };
}

function applyBatchedUpdates(sheet, updates, exerciseCol, batchSize) {
  updates.sort((a, b) => a.row - b.row);

  const updateBatches = [];
  let currentBatch = null;

  for (const update of updates) {
    if (
      !currentBatch ||
      update.row !== currentBatch.endRow + 1 ||
      update.row - currentBatch.startRow >= batchSize
    ) {
      if (currentBatch) {
        updateBatches.push(currentBatch);
      }
      currentBatch = {
        startRow: update.row,
        endRow: update.row,
        values: [[update.value]],
      };
    } else {
      currentBatch.endRow = update.row;
      currentBatch.values.push([update.value]);
    }
  }

  if (currentBatch) {
    updateBatches.push(currentBatch);
  }

  for (const updateBatch of updateBatches) {
    const updateRange = sheet.getRange(
      updateBatch.startRow,
      exerciseCol,
      updateBatch.values.length,
      1
    );
    updateRange.setValues(updateBatch.values);
  }
}

describe("ExerciseLocalization", () => {
  let mockWorkoutSheet;
  let mockExerciseSheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkoutSheet = {
      getLastRow: jest.fn(() => 10),
      getDataRange: jest.fn(),
    };
    mockExerciseSheet = {
      getLastRow: jest.fn(() => 10),
      getDataRange: jest.fn(),
    };
    mockSpreadsheet.getSheetByName.mockImplementation((name) => {
      if (name === WORKOUTS_SHEET_NAME) return mockWorkoutSheet;
      if (name === EXERCISES_SHEET_NAME) return mockExerciseSheet;
      return null;
    });
  });

  describe("buildLocalizedNameMapFromSheet()", () => {
    test("should build map from workout sheet data", () => {
      mockWorkoutSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Exercise", "Exercise Template ID"],
          ["W001", "Press de Banca", "EX001"],
          ["W002", "Sentadilla", "EX002"],
        ]),
      });

      const result = buildLocalizedNameMapFromSheet(mockWorkoutSheet);

      expect(result.size).toBe(2);
      expect(result.get("EX001")).toBe("Press de Banca");
      expect(result.get("EX002")).toBe("Sentadilla");
    });

    test("should return empty map if headers missing", () => {
      mockWorkoutSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [["ID", "Exercise"]]),
      });

      const result = buildLocalizedNameMapFromSheet(mockWorkoutSheet);

      expect(result.size).toBe(0);
    });

    test("should skip N/A exercise template IDs", () => {
      mockWorkoutSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Exercise", "Exercise Template ID"],
          ["W001", "Custom Exercise", "N/A"],
        ]),
      });

      const result = buildLocalizedNameMapFromSheet(mockWorkoutSheet);

      expect(result.size).toBe(0);
    });

    test("should skip empty exercise template IDs", () => {
      mockWorkoutSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Exercise", "Exercise Template ID"],
          ["W001", "Custom Exercise", ""],
        ]),
      });

      const result = buildLocalizedNameMapFromSheet(mockWorkoutSheet);

      expect(result.size).toBe(0);
    });
  });

  describe("buildExerciseNameMaps()", () => {
    test("should build maps for exercises with localized names", () => {
      const idToLocalizedName = new Map([
        ["EX001", "Press de Banca"],
        ["EX002", "Sentadilla"],
      ]);

      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Title"],
          ["EX001", "Bench Press"],
          ["EX002", "Squat"],
        ]),
      });

      const result = buildExerciseNameMaps(
        mockExerciseSheet,
        idToLocalizedName
      );

      expect(result.exerciseNameToLocalized.size).toBeGreaterThan(0);
      expect(result.exerciseNameToLocalized.get("bench press")).toBe(
        "Press de Banca"
      );
      expect(result.exerciseUpdates.length).toBe(2);
      expect(result.nameToExerciseId.get("bench press")).toBe("EX001");
    });

    test("should not create updates if names match", () => {
      const idToLocalizedName = new Map([["EX001", "Bench Press"]]);

      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Title"],
          ["EX001", "Bench Press"],
        ]),
      });

      const result = buildExerciseNameMaps(
        mockExerciseSheet,
        idToLocalizedName
      );

      expect(result.exerciseUpdates.length).toBe(0);
    });

    test("should handle exercises without localized names", () => {
      const idToLocalizedName = new Map();

      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [
          ["ID", "Title"],
          ["EX001", "Bench Press"],
        ]),
      });

      const result = buildExerciseNameMaps(
        mockExerciseSheet,
        idToLocalizedName
      );

      expect(result.exerciseNameToLocalized.get("bench press")).toBe(
        "Bench Press"
      );
      expect(result.exerciseUpdates.length).toBe(0);
    });

    test("should validate headers", () => {
      const idToLocalizedName = new Map();
      mockExerciseSheet.getDataRange.mockReturnValue({
        getValues: jest.fn(() => [["ID", "Title"]]),
      });

      buildExerciseNameMaps(mockExerciseSheet, idToLocalizedName);

      expect(validateExerciseSheetHeaders).toHaveBeenCalledWith(
        ["ID", "Title"],
        ["ID", "Title"]
      );
    });
  });

  describe("applyBatchedUpdates()", () => {
    test("should batch consecutive row updates", () => {
      const mockSheet = {
        getRange: jest.fn(() => ({
          setValues: jest.fn(),
        })),
      };
      const updates = [
        { row: 2, value: "Press de Banca" },
        { row: 3, value: "Sentadilla" },
        { row: 4, value: "Peso Muerto" },
      ];

      applyBatchedUpdates(mockSheet, updates, 2, 100);

      expect(mockSheet.getRange).toHaveBeenCalledTimes(1);
      expect(mockSheet.getRange).toHaveBeenCalledWith(2, 2, 3, 1);
    });

    test("should split non-consecutive updates into separate batches", () => {
      const mockSheet = {
        getRange: jest.fn(() => ({
          setValues: jest.fn(),
        })),
      };
      const updates = [
        { row: 2, value: "Press de Banca" },
        { row: 3, value: "Sentadilla" },
        { row: 10, value: "Peso Muerto" },
      ];

      applyBatchedUpdates(mockSheet, updates, 2, 100);

      expect(mockSheet.getRange).toHaveBeenCalledTimes(2);
    });

    test("should respect batch size limit", () => {
      const mockSheet = {
        getRange: jest.fn(() => ({
          setValues: jest.fn(),
        })),
      };
      const updates = Array.from({ length: 150 }, (_, i) => ({
        row: i + 2,
        value: `Exercise ${i}`,
      }));

      applyBatchedUpdates(mockSheet, updates, 2, 100);

      expect(mockSheet.getRange.mock.calls.length).toBeGreaterThan(1);
    });

    test("should sort updates by row", () => {
      const mockSheet = {
        getRange: jest.fn(() => ({
          setValues: jest.fn(),
        })),
      };
      const updates = [
        { row: 5, value: "Exercise 5" },
        { row: 2, value: "Exercise 2" },
        { row: 4, value: "Exercise 4" },
      ];

      applyBatchedUpdates(mockSheet, updates, 2, 100);

      const firstCall = mockSheet.getRange.mock.calls[0];
      expect(firstCall[0]).toBe(2);
    });
  });
});
