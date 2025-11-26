/**
 * Tests for Workouts.gs - Workout import and management functions
 */

const {
  createMockWorkout,
  createMockWorkoutEvent,
  createMockApiResponse,
} = require("../helpers/testHelpers");

// Mock constants
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const API_ENDPOINTS = {
  WORKOUTS: "/workouts",
  WORKOUTS_EVENTS: "/workouts/events",
};
const PAGE_SIZE = {
  WORKOUTS: 10,
};
const TOAST_DURATION = {
  NORMAL: 5,
};

// Mock error classes
class ConfigurationError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = "ConfigurationError";
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

// Mock ApiClient
const mockApiClient = {
  fetchPaginatedData: jest.fn(),
  makeRequest: jest.fn(),
  createRequestOptions: jest.fn(),
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
  getSheetByName: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(() => mockSpreadsheet),
};

// Mock PropertiesService
const createMockProperties = () => {
  const store = {};
  return {
    getProperty: jest.fn((key) => store[key] || null),
    setProperty: jest.fn((key, value) => {
      store[key] = value;
    }),
    deleteProperty: jest.fn((key) => {
      delete store[key];
    }),
    _store: store,
  };
};

const mockProperties = createMockProperties();
global.getDocumentProperties = jest.fn(() => mockProperties);

// Mock formatDate utility
global.formatDate = jest.fn((date) => date || "");

// Mock normalizeSetType, normalizeWeight, normalizeNumber utilities
global.normalizeSetType = jest.fn((type) => type || "");
global.normalizeWeight = jest.fn((weight) => weight || "");
global.normalizeNumber = jest.fn((num) => num || "");

// Simplified workout import functions for testing
function getLastWorkoutUpdate(sheet) {
  if (!sheet.getRange("A2").getValue()) return false;
  const properties = getDocumentProperties();
  return properties?.getProperty("LAST_WORKOUT_UPDATE") || false;
}

function processWorkoutEvents(events) {
  const deletedIds = new Set();
  const upsertIds = [];

  events.forEach((e) => {
    if (e.type === "deleted") {
      const id = e.workout?.id || e.id;
      if (id) deletedIds.add(id);
    } else if (e.type === "updated" || e.type === "created") {
      const id = e.workout?.id;
      if (id) upsertIds.push(id);
    }
  });

  return { deletedIds, upsertIds };
}

function createEmptyWorkoutRow(workout) {
  return [
    workout.id,
    workout.title,
    formatDate(workout.start_time),
    formatDate(workout.end_time),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

function createWorkoutRows(workout) {
  return workout.exercises.flatMap((ex) =>
    ex.sets.map((set) => [
      workout.id,
      workout.title,
      formatDate(workout.start_time),
      formatDate(workout.end_time),
      ex.title,
      ex.exercise_template_id || "",
      normalizeSetType(set.type),
      normalizeWeight(set.weight_kg),
      normalizeNumber(set.reps ?? set.distance_meters),
      normalizeNumber(set.duration_seconds),
      normalizeNumber(set.rpe),
    ])
  );
}

function processWorkoutsData(workouts) {
  try {
    return workouts.flatMap((w) =>
      !w.exercises?.length ? [createEmptyWorkoutRow(w)] : createWorkoutRows(w)
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing workout data",
      workoutCount: workouts.length,
    });
  }
}

describe("Workouts", () => {
  let mockSheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSheet = {
      getRange: jest.fn(() => ({
        getValue: jest.fn(() => null),
      })),
    };
    mockProperties._store = {};
  });

  describe("getLastWorkoutUpdate()", () => {
    test("should return false if no data in sheet", () => {
      mockSheet.getRange.mockReturnValue({
        getValue: jest.fn(() => null),
      });

      const result = getLastWorkoutUpdate(mockSheet);

      expect(result).toBe(false);
    });

    test("should return timestamp from properties if data exists", () => {
      mockSheet.getRange.mockReturnValue({
        getValue: jest.fn(() => "some value"),
      });
      mockProperties._store["LAST_WORKOUT_UPDATE"] = "2024-01-01T00:00:00Z";
      mockProperties.getProperty.mockImplementation((key) => {
        return mockProperties._store[key] || null;
      });
      getDocumentProperties.mockReturnValue(mockProperties);

      const result = getLastWorkoutUpdate(mockSheet);

      expect(result).toBe("2024-01-01T00:00:00Z");
    });

    test("should return false if property not set", () => {
      mockSheet.getRange.mockReturnValue({
        getValue: jest.fn(() => "some value"),
      });

      const result = getLastWorkoutUpdate(mockSheet);

      expect(result).toBe(false);
    });
  });

  describe("processWorkoutEvents()", () => {
    test("should process deleted events", () => {
      const events = [
        createMockWorkoutEvent({ type: "deleted", id: "workout-1", workout: null }),
        createMockWorkoutEvent({
          type: "deleted",
          id: null,
          workout: { id: "workout-2" },
        }),
      ];

      const result = processWorkoutEvents(events);

      expect(result.deletedIds.size).toBe(2);
      expect(result.deletedIds.has("workout-1")).toBe(true);
      expect(result.deletedIds.has("workout-2")).toBe(true);
    });

    test("should process updated events", () => {
      const events = [
        createMockWorkoutEvent({
          type: "updated",
          workout: { id: "workout-1" },
        }),
        createMockWorkoutEvent({
          type: "created",
          workout: { id: "workout-2" },
        }),
      ];

      const result = processWorkoutEvents(events);

      expect(result.upsertIds).toEqual(["workout-1", "workout-2"]);
    });

    test("should handle mixed event types", () => {
      const events = [
        createMockWorkoutEvent({ type: "deleted", id: "workout-1" }),
        createMockWorkoutEvent({
          type: "updated",
          workout: { id: "workout-2" },
        }),
        createMockWorkoutEvent({
          type: "created",
          workout: { id: "workout-3" },
        }),
      ];

      const result = processWorkoutEvents(events);

      expect(result.deletedIds.size).toBe(1);
      expect(result.upsertIds.length).toBe(2);
    });

    test("should handle events without IDs", () => {
      const events = [
        { type: "deleted" }, // No id or workout
        { type: "updated", workout: {} }, // Empty workout object, no id
      ];

      const result = processWorkoutEvents(events);

      expect(result.deletedIds.size).toBe(0);
      expect(result.upsertIds.length).toBe(0);
    });
  });

  describe("processWorkoutsData()", () => {
    test("should process workout without exercises", () => {
      const workout = createMockWorkout({ exercises: [] });

      const result = processWorkoutsData([workout]);

      expect(result.length).toBe(1);
      expect(result[0][0]).toBe(workout.id);
      expect(result[0][4]).toBe(""); // Exercise column empty
    });

    test("should process workout with exercises and sets", () => {
      const workout = createMockWorkout({
        exercises: [
          {
            title: "Bench Press",
            exercise_template_id: "EX001",
            sets: [
              { type: "normal", weight_kg: 100, reps: 10 },
              { type: "normal", weight_kg: 105, reps: 8 },
            ],
          },
        ],
      });

      const result = processWorkoutsData([workout]);

      expect(result.length).toBe(2); // Two sets
      expect(result[0][4]).toBe("Bench Press");
      expect(result[0][5]).toBe("EX001");
    });

    test("should handle multiple workouts", () => {
      const workouts = [
        createMockWorkout({ id: "w1", exercises: [] }),
        createMockWorkout({
          id: "w2",
          exercises: [
            {
              title: "Squat",
              exercise_template_id: "EX002",
              sets: [{ type: "normal", weight_kg: 150, reps: 5 }],
            },
          ],
        }),
      ];

      const result = processWorkoutsData(workouts);

      expect(result.length).toBe(2); // One empty row + one set row
    });

    test("should handle errors during processing", () => {
      const invalidWorkout = null;

      expect(() => {
        processWorkoutsData([invalidWorkout]);
      }).toThrow();

      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("createEmptyWorkoutRow()", () => {
    test("should create row with workout metadata", () => {
      const workout = createMockWorkout();

      const result = createEmptyWorkoutRow(workout);

      expect(result[0]).toBe(workout.id);
      expect(result[1]).toBe(workout.title);
      expect(result[4]).toBe(""); // Exercise column
    });
  });

  describe("createWorkoutRows()", () => {
    test("should create rows for each set", () => {
      const workout = createMockWorkout({
        exercises: [
          {
            title: "Bench Press",
            exercise_template_id: "EX001",
            sets: [
              { type: "normal", weight_kg: 100, reps: 10 },
              { type: "normal", weight_kg: 105, reps: 8 },
            ],
          },
        ],
      });

      const result = createWorkoutRows(workout);

      expect(result.length).toBe(2);
      expect(result[0][4]).toBe("Bench Press");
      expect(result[0][5]).toBe("EX001");
    });

    test("should handle multiple exercises", () => {
      const workout = createMockWorkout({
        exercises: [
          {
            title: "Bench Press",
            exercise_template_id: "EX001",
            sets: [{ type: "normal", weight_kg: 100, reps: 10 }],
          },
          {
            title: "Squat",
            exercise_template_id: "EX002",
            sets: [{ type: "normal", weight_kg: 150, reps: 5 }],
          },
        ],
      });

      const result = createWorkoutRows(workout);

      expect(result.length).toBe(2);
    });
  });
});
