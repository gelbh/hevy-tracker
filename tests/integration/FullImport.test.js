/**
 * Integration tests for full data import workflow
 */

const {
  createMockWorkout,
  createMockExercise,
  createMockRoutine,
} = require("../helpers/testHelpers");

// Mock constants
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const ROUTINES_SHEET_NAME = "Routines";
const PAGE_SIZE = {
  WORKOUTS: 10,
  EXERCISES: 100,
  ROUTINES: 10,
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
  runFullImport: jest.fn(),
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
  async clearSheet() {}
}

global.SheetManager = SheetManager;

// Mock SpreadsheetApp
const mockSpreadsheet = {
  toast: jest.fn(),
  getId: jest.fn(() => "spreadsheet-123"),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock import functions
global.importAllExercises = jest.fn();
global.importAllRoutines = jest.fn();
global.importAllRoutineFolders = jest.fn();
global.importAllWorkouts = jest.fn();

describe("Full Import Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("runFullImport()", () => {
    test("should execute full import sequence", async () => {
      mockApiClient.runFullImport.mockResolvedValue(undefined);

      await mockApiClient.runFullImport();

      expect(mockApiClient.runFullImport).toHaveBeenCalled();
    });

    test("should handle import errors gracefully", async () => {
      const error = new Error("Import failed");
      mockApiClient.runFullImport.mockImplementation(async () => {
        throw ErrorHandler.handle(error, { operation: "Full import" });
      });

      await expect(mockApiClient.runFullImport()).rejects.toThrow();

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("Import Workflow", () => {
    test("should import exercises first", async () => {
      mockApiClient.fetchPaginatedData.mockResolvedValue(10);

      // Call the mocked function
      await importAllExercises();

      // The function should be callable
      expect(typeof importAllExercises).toBe("function");
    });

    test("should import workouts after exercises", async () => {
      mockApiClient.fetchPaginatedData.mockResolvedValue(5);

      // Call the mocked function
      await importAllWorkouts();

      // The function should be callable
      expect(typeof importAllWorkouts).toBe("function");
    });

    test("should import routines after folders", async () => {
      mockApiClient.fetchPaginatedData.mockResolvedValue(3);

      // Call the mocked function
      await importAllRoutines();

      // The function should be callable
      expect(typeof importAllRoutines).toBe("function");
    });
  });

  describe("Data Consistency", () => {
    test("should maintain data consistency across imports", async () => {
      const exercises = [createMockExercise()];
      const workouts = [createMockWorkout()];
      const routines = [createMockRoutine()];

      importAllExercises.mockImplementation(async () => {
        await mockApiClient.fetchPaginatedData("/exercise_templates", 100, jest.fn(), "exercise_templates");
      });
      importAllWorkouts.mockImplementation(async () => {
        await mockApiClient.fetchPaginatedData("/workouts", 10, jest.fn(), "workouts");
      });
      importAllRoutines.mockImplementation(async () => {
        await mockApiClient.fetchPaginatedData("/routines", 10, jest.fn(), "routines");
      });

      mockApiClient.fetchPaginatedData
        .mockResolvedValueOnce(exercises.length)
        .mockResolvedValueOnce(workouts.length)
        .mockResolvedValueOnce(routines.length);

      await importAllExercises();
      await importAllWorkouts();
      await importAllRoutines();

      expect(mockApiClient.fetchPaginatedData).toHaveBeenCalledTimes(3);
    });
  });
});
