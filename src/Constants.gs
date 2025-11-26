/**
 * Authorized API key used for special weight import formula setup.
 * When this key is detected during initial import, sets up a formula
 * to import weight data from a shared spreadsheet.
 * @type {string}
 */
const AUTHORIZED_API_KEY = "PLACEHOLDER_KEY";

/**
 * Template Spreadsheet ID for the official Hevy Tracker template
 * @type {string}
 */
const TEMPLATE_SPREADSHEET_ID = "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

/**
 * Sheet name constants
 * @type {Object<string>}
 */
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const ROUTINES_SHEET_NAME = "Routines";
const ROUTINE_FOLDERS_SHEET_NAME = "Routine Folders";
const WEIGHT_SHEET_NAME = "Weight History";

/**
 * API endpoint configuration
 * @type {Object<string>}
 */
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS: "/workouts",
  WORKOUTS_EVENTS: "/workouts/events",
  WORKOUTS_COUNT: "/workouts/count",
  ROUTINES: "/routines",
  EXERCISES: "/exercise_templates",
  ROUTINE_FOLDERS: "/routine_folders",
};

/**
 * Pagination page sizes for API requests
 * @type {Object<number>}
 */
const PAGE_SIZE = {
  WORKOUTS: 10,
  ROUTINES: 10,
  EXERCISES: 100,
  ROUTINE_FOLDERS: 10,
};

/**
 * Rate limiting configuration
 * @type {Object<number>}
 */
const RATE_LIMIT = {
  API_DELAY: 50,
  BATCH_SIZE: 100,
  MAX_RETRIES: 5,
  BACKOFF_MULTIPLIER: 2,
};

/**
 * Toast notification duration in seconds
 * @type {Object<number>}
 */
const TOAST_DURATION = {
  SHORT: 3,
  NORMAL: 5,
  LONG: 8,
};

/**
 * Sheet header definitions for each sheet type
 * @type {Object<Array<string>>}
 */
const SHEET_HEADERS = {
  [WORKOUTS_SHEET_NAME]: [
    "ID",
    "Title",
    "Start Time",
    "End Time",
    "Exercise",
    "Exercise Template ID",
    "Set Type",
    "Weight (kg)",
    "Reps / Distance (m)",
    "Duration (s)",
    "RPE",
  ],
  [ROUTINES_SHEET_NAME]: [
    "ID",
    "Title",
    "Folder ID",
    "Last Updated",
    "Created At",
    "Exercise",
    "Set Type",
    "Weight (kg)",
    "Reps / Distance (m)",
    "Duration (s)",
  ],
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
  [ROUTINE_FOLDERS_SHEET_NAME]: [
    "ID",
    "Name",
    "Last Updated",
    "Created At",
    "Index",
  ],
  [WEIGHT_SHEET_NAME]: ["Timestamp", "Weight"],
};

/**
 * Creates a theme object with consistent structure
 * @param {string} evenRowColor - Color for even rows
 * @param {string} borderColor - Border color
 * @param {string} fontColor - Font color
 * @param {string} [oddRowColor="#FFFFFF"] - Color for odd rows
 * @returns {Object} Theme object
 * @private
 */
function createTheme(
  evenRowColor,
  borderColor,
  fontColor,
  oddRowColor = "#FFFFFF"
) {
  return {
    evenRowColor,
    oddRowColor,
    borderColor,
    fontColor,
  };
}

/**
 * Sheet theme definitions
 * @type {Object<Object>}
 */
const BLUE_THEME = createTheme("#E6F3FF", "#B3D9FF", "#2C5777");
const GREEN_THEME = createTheme("#E8F5E9", "#C8E6C9", "#2E7D32");
const PURPLE_THEME = createTheme("#F3E5F5", "#E1BEE7", "#6A1B9A");
const ORANGE_THEME = createTheme("#FFF3E0", "#FFE0B2", "#E65100");
const GRAY_THEME = createTheme("#F5F5F5", "#E0E0E0", "#424242");
const TEAL_THEME = createTheme("#E0F2F1", "#B2DFDB", "#00695C");
const RED_THEME = createTheme("#FFEBEE", "#FFCDD2", "#B71C1C");
const YELLOW_THEME = createTheme("#FFFDE7", "#FFF9C4", "#F57F17");

/**
 * Mapping of sheet names to their theme configurations
 * @type {Object<Object>}
 */
const SHEET_THEMES = {
  [WORKOUTS_SHEET_NAME]: BLUE_THEME,
  [EXERCISES_SHEET_NAME]: GREEN_THEME,
  [ROUTINES_SHEET_NAME]: RED_THEME,
  [ROUTINE_FOLDERS_SHEET_NAME]: TEAL_THEME,
  [WEIGHT_SHEET_NAME]: PURPLE_THEME,
};
