/**
 * Test helper utilities for generating mock data and common test operations
 * @module TestHelpers
 */

/**
 * Creates a mock workout object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock workout object
 */
function createMockWorkout(overrides = {}) {
  return {
    id: "workout-123",
    title: "Test Workout",
    start_time: "2024-01-01T10:00:00Z",
    end_time: "2024-01-01T11:00:00Z",
    exercises: [
      {
        title: "Bench Press (Barbell)",
        exercise_template_id: "EX001",
        sets: [
          {
            type: "normal",
            weight_kg: 100,
            reps: 10,
            rpe: 8.5,
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Creates a mock exercise template object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock exercise template object
 */
function createMockExercise(overrides = {}) {
  return {
    id: "EX001",
    title: "Bench Press (Barbell)",
    type: "weight_reps",
    primary_muscle_group: "chest",
    secondary_muscle_groups: ["shoulders", "triceps"],
    is_custom: false,
    ...overrides,
  };
}

/**
 * Creates a mock routine object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock routine object
 */
function createMockRoutine(overrides = {}) {
  return {
    id: "routine-123",
    title: "Test Routine",
    folder_id: null,
    updated_at: "2024-01-01T10:00:00Z",
    created_at: "2024-01-01T10:00:00Z",
    exercises: [
      {
        index: 0,
        title: "Bench Press (Barbell)",
        rest_seconds: 60,
        notes: "Focus on form",
        exercise_template_id: "EX001",
        supersets_id: null,
        sets: [
          {
            index: 0,
            type: "normal",
            weight_kg: 100,
            reps: 10,
            rep_range: { start: 8, end: 12 },
          },
        ],
      },
    ],
    ...overrides,
  };
}

/**
 * Creates a mock routine folder object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock routine folder object
 */
function createMockRoutineFolder(overrides = {}) {
  return {
    id: 1,
    title: "Test Folder",
    index: 0,
    ...overrides,
  };
}

/**
 * Creates a mock workout event object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock workout event object
 */
function createMockWorkoutEvent(overrides = {}) {
  return {
    id: "event-123",
    type: "updated",
    workout: {
      id: "workout-123",
      title: "Test Workout",
    },
    ...overrides,
  };
}

/**
 * Creates a mock API response
 * @param {Object} options - Response options
 * @param {number} options.statusCode - HTTP status code
 * @param {string|Object} options.content - Response content
 * @param {Object} options.headers - Response headers
 * @returns {Object} Mock response object
 */
function createMockApiResponse({
  statusCode = 200,
  content = {},
  headers = {},
} = {}) {
  const contentText =
    typeof content === "string" ? content : JSON.stringify(content);

  return {
    getResponseCode: jest.fn(() => statusCode),
    getContentText: jest.fn(() => contentText),
    getHeaders: jest.fn(() => headers),
  };
}

/**
 * Creates a mock sheet object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock sheet object
 */
function createMockSheet(overrides = {}) {
  const defaultValues = [["ID", "Title", "Date"]];
  const values = overrides.values || defaultValues;

  return {
    getName: jest.fn(() => overrides.name || "Test Sheet"),
    getLastRow: jest.fn(() => values.length),
    getLastColumn: jest.fn(() => (values[0] || []).length),
    getMaxRows: jest.fn(() => 1000),
    getMaxColumns: jest.fn(() => 26),
    getRange: jest.fn((row, col, numRows, numCols) => {
      const range = {
        getValues: jest.fn(() => {
          if (numRows && numCols) {
            return values
              .slice(row - 1, row - 1 + numRows)
              .map((r) => r.slice(col - 1, col - 1 + numCols));
          }
          return values[row - 1] || [];
        }),
        getFormulas: jest.fn(() => {
          return Array(numRows || 1)
            .fill(null)
            .map(() => Array(numCols || 1).fill(""));
        }),
        setValues: jest.fn(),
        setValue: jest.fn(),
        setFontWeight: jest.fn(() => range),
        setBackground: jest.fn(() => range),
        setFontColor: jest.fn(() => range),
        setFontFamily: jest.fn(() => range),
        setFontSize: jest.fn(() => range),
        setVerticalAlignment: jest.fn(() => range),
        setBorder: jest.fn(() => range),
        clear: jest.fn(),
        clearContents: jest.fn(),
        getValue: jest.fn(() => {
          const row = values[row - 1];
          return row ? row[col - 1] : null;
        }),
        getFormula: jest.fn(() => ""),
      };
      return range;
    }),
    getDataRange: jest.fn(() => {
      return {
        getValues: jest.fn(() => values),
        getFormulas: jest.fn(() =>
          values.map(() => Array(values[0].length).fill(""))
        ),
      };
    }),
    insertSheet: jest.fn(),
    insertRowsBefore: jest.fn(),
    deleteRows: jest.fn(),
    deleteColumns: jest.fn(),
    clear: jest.fn(),
    clearContents: jest.fn(),
    setFrozenRows: jest.fn(),
    clearConditionalFormatRules: jest.fn(),
    setConditionalFormatRules: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates a mock spreadsheet object
 * @param {Object} overrides - Properties to override defaults
 * @returns {Object} Mock spreadsheet object
 */
function createMockSpreadsheet(overrides = {}) {
  const sheets = overrides.sheets || [createMockSheet({ name: "Sheet1" })];

  return {
    getId: jest.fn(() => overrides.id || "spreadsheet-123"),
    getName: jest.fn(() => overrides.name || "Test Spreadsheet"),
    getSheetByName: jest.fn((name) => {
      return sheets.find((s) => s.getName() === name) || null;
    }),
    insertSheet: jest.fn((name) => {
      const newSheet = createMockSheet({ name });
      sheets.push(newSheet);
      return newSheet;
    }),
    getSheets: jest.fn(() => sheets),
    toast: jest.fn(),
    ...overrides,
  };
}

/**
 * Creates mock constants for testing
 * @returns {Object} Mock constants object
 */
function createMockConstants() {
  return {
    API_ENDPOINTS: {
      BASE: "https://api.hevyapp.com/v1",
      WORKOUTS: "/workouts",
      WORKOUTS_EVENTS: "/workouts/events",
      WORKOUTS_COUNT: "/workouts/count",
      ROUTINES: "/routines",
      EXERCISES: "/exercise_templates",
      ROUTINE_FOLDERS: "/routine_folders",
    },
    PAGE_SIZE: {
      WORKOUTS: 10,
      ROUTINES: 10,
      EXERCISES: 100,
      ROUTINE_FOLDERS: 10,
    },
    RATE_LIMIT: {
      API_DELAY: 50,
      BATCH_SIZE: 100,
      MAX_RETRIES: 5,
      BACKOFF_MULTIPLIER: 2,
    },
    TOAST_DURATION: {
      SHORT: 3,
      NORMAL: 5,
      LONG: 8,
    },
    WORKOUTS_SHEET_NAME: "Workouts",
    EXERCISES_SHEET_NAME: "Exercises",
    ROUTINES_SHEET_NAME: "Routines",
    ROUTINE_FOLDERS_SHEET_NAME: "Routine Folders",
    WEIGHT_SHEET_NAME: "Weight History",
    SHEET_HEADERS: {
      Workouts: ["ID", "Title", "Start Time", "End Time"],
      Exercises: ["ID", "Title", "Type", "Primary Muscle Group"],
      Routines: ["ID", "Title", "Folder ID"],
    },
    SHEET_THEMES: {
      Workouts: {
        evenRowColor: "#f8f9fa",
        oddRowColor: "#ffffff",
        fontColor: "#000000",
        borderColor: "#e0e0e0",
      },
      Exercises: {
        evenRowColor: "#f8f9fa",
        oddRowColor: "#ffffff",
        fontColor: "#000000",
        borderColor: "#e0e0e0",
      },
    },
  };
}

/**
 * Asserts that sheet data matches expected values
 * @param {Array<Array>} actual - Actual sheet data
 * @param {Array<Array>} expected - Expected sheet data
 * @param {string} message - Assertion message
 */
function assertSheetData(actual, expected, message = "Sheet data mismatch") {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]).toEqual(expected[i]);
  }
}

module.exports = {
  createMockWorkout,
  createMockExercise,
  createMockRoutine,
  createMockRoutineFolder,
  createMockWorkoutEvent,
  createMockApiResponse,
  createMockSheet,
  createMockSpreadsheet,
  createMockConstants,
  assertSheetData,
};
