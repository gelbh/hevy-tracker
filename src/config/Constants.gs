/**
 * @typedef {Object} SheetTheme
 * @property {string} evenRowColor - Background color for even rows
 * @property {string} oddRowColor - Background color for odd rows
 * @property {string} borderColor - Border color for cells
 * @property {string} fontColor - Font color for text
 */

/**
 * @typedef {Object} ApiClientRetryConfig
 * @property {number} maxRetries - Maximum number of retry attempts
 * @property {number} baseDelay - Base delay in milliseconds for exponential backoff
 * @property {number} maxDelay - Maximum delay in milliseconds for exponential backoff
 */

/**
 * @typedef {Object} CircuitBreakerState
 * @property {number} failures - Current number of consecutive failures
 * @property {number|null} lastFailureTime - Timestamp of last failure (milliseconds)
 * @property {string} state - Circuit breaker state: "CLOSED", "OPEN", or "HALF_OPEN"
 * @property {number} failureThreshold - Number of failures before opening circuit
 * @property {number} resetTimeout - Time to wait before attempting reset (milliseconds)
 */

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
  API_DELAY: 50, // Milliseconds between API requests
  BATCH_SIZE: 100, // Default batch size for operations
  MAX_RETRIES: 5, // Maximum retry attempts
  BACKOFF_MULTIPLIER: 2, // Exponential backoff multiplier
};

/**
 * HTTP status codes
 * @type {Object<number>}
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

/**
 * HTTP status code ranges
 * @type {Object<number>}
 */
const HTTP_STATUS_RANGE = {
  SUCCESS_START: 200,
  SUCCESS_END: 299,
  CLIENT_ERROR_START: 400,
  CLIENT_ERROR_END: 499,
  SERVER_ERROR_START: 500,
  SERVER_ERROR_END: 599,
};

/**
 * API client configuration
 * @type {Object<number>}
 */
const API_CLIENT_CONFIG = {
  BASE_DELAY_MS: 1000, // Base delay for exponential backoff (milliseconds)
  MAX_DELAY_MS: 10000, // Maximum delay for exponential backoff (milliseconds)
  VALIDATION_TIMEOUT_MS: 15000, // Timeout for API key validation (milliseconds)
  REQUEST_TIMEOUT_MS: 30000, // Timeout for API requests (milliseconds)
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: 5, // Number of failures before opening circuit
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: 60000, // Time to wait before attempting reset (1 minute)
};

/**
 * Batch processing configuration
 * @type {Object<number>}
 */
const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 100, // Default batch size for general operations
  EXERCISE_COUNT_BATCH_SIZE: 1000, // Batch size for exercise count updates
  SHEET_UPDATE_BATCH_SIZE: 1000, // Batch size for sheet updates
};

/**
 * Cache configuration
 * @type {Object<number>}
 */
const CACHE_CONFIG = {
  TTL_SECONDS: 600, // Time-to-live for cache entries (10 minutes, max for CacheService)
  MAX_MEMORY_CACHE_SIZE: 100, // Maximum number of entries in memory cache
};

/**
 * Import timeout configuration
 * @type {Object<number|string>}
 */
const MAX_IMPORT_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutes - safety margin before 6-minute limit
const IMPORT_PROGRESS_PROPERTY_KEY = "IMPORT_PROGRESS_STATE";

/**
 * Dialog dimensions configuration
 * @type {Object<number>}
 */
const DIALOG_DIMENSIONS = {
  DEFAULT_WIDTH: 500,
  DEFAULT_HEIGHT: 500,
  API_KEY_WIDTH: 450,
  API_KEY_HEIGHT: 400,
  ROUTINE_CREATED_WIDTH: 400,
  ROUTINE_CREATED_HEIGHT: 300,
  SIDEBAR_WIDTH: 300,
  SETUP_INSTRUCTIONS_WIDTH: 700,
  SETUP_INSTRUCTIONS_HEIGHT: 700,
  IMPORT_WEIGHT_WIDTH: 600,
  IMPORT_WEIGHT_HEIGHT: 420,
  DEV_API_MANAGER_WIDTH: 600,
  DEV_API_MANAGER_HEIGHT: 480,
};

/**
 * Developer configuration
 * @type {Object<Array<string>>}
 */
const DEVELOPER_CONFIG = {
  EMAILS: ["gelbharttomer@gmail.com"],
};

/**
 * Weight validation configuration
 * @type {Object<number>}
 */
const WEIGHT_CONFIG = {
  MAX_WEIGHT_LBS: 1100,
  MAX_WEIGHT_STONE: 78.5,
  MAX_WEIGHT_KG: 500,
  PRECISION_DECIMALS: 2, // Number of decimal places for weight values
};

/**
 * Weight conversion factors
 * @type {Object<number>}
 */
const WEIGHT_CONVERSION = {
  LBS_TO_KG: 0.45359237,
  STONE_TO_KG: 6.35029,
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
