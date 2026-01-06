/**
 * Global configuration constants for the Hevy Tracker add-on
 * @module Constants
 */

/**
 * Type Definitions
 */

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
 * Application Configuration
 */

/**
 * Authorized API key used for special weight import formula setup
 * When this key is detected during initial import, sets up a formula
 * to import weight data from a shared spreadsheet
 * @type {string}
 */
const AUTHORIZED_API_KEY = "PLACEHOLDER_KEY";

/**
 * Template Spreadsheet ID for the official Hevy Tracker template
 * @type {string}
 */
const TEMPLATE_SPREADSHEET_ID = "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

/**
 * Sheet Configuration
 */

/**
 * Sheet name constants for all sheet types
 * @type {Object<string>}
 */
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const ROUTINES_SHEET_NAME = "Routines";
const ROUTINE_FOLDERS_SHEET_NAME = "Routine Folders";
const WEIGHT_SHEET_NAME = "Weight History";

/**
 * API Configuration
 */

/**
 * API endpoint configuration for Hevy API
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
 * Pagination page sizes for API requests (maximum items per page)
 * @type {Object<number>}
 */
const PAGE_SIZE = {
  WORKOUTS: 10,
  ROUTINES: 10,
  EXERCISES: 100,
  ROUTINE_FOLDERS: 10,
};

/**
 * Maximum number of pages to fetch in pagination loops
 * Safety limit to prevent infinite loops if API returns inconsistent data
 * @type {number}
 */
const MAX_PAGES = 10000;

/**
 * Rate limiting configuration to respect API quotas
 * @type {Object<number>}
 */
const RATE_LIMIT = {
  API_DELAY: 25, // Milliseconds between API requests when rate limit info unavailable
  BATCH_SIZE: 100, // Default batch size for operations
  MAX_RETRIES: 5, // Maximum retry attempts
  BACKOFF_MULTIPLIER: 2, // Exponential backoff multiplier
  PARALLEL_PAGE_CONCURRENCY: 4, // Number of pages to fetch in parallel using UrlFetchApp.fetchAll
};

/**
 * HTTP Status Codes
 */

/**
 * HTTP status codes used for API response handling
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
 * HTTP status code ranges for response categorization
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
 * API client configuration for retry logic and circuit breaker
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
 * Performance Configuration
 */

/**
 * Batch processing configuration for optimizing sheet operations
 * @type {Object<number>}
 */
const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 100, // Default batch size for general operations
  EXERCISE_COUNT_BATCH_SIZE: 1000, // Batch size for exercise count updates (timeout checked every 200 rows)
  SHEET_UPDATE_BATCH_SIZE: 500, // Batch size for sheet updates (reduced for more frequent timeout checks)
};

/**
 * Workout import failure handling configuration
 * @type {Object<number>}
 */
const WORKOUT_IMPORT_CONFIG = {
  FAILURE_THRESHOLD: 0.5, // Maximum percentage of failures before aborting (0.5 = 50%)
  MIN_SUCCESS_COUNT: 1, // Minimum number of successful requests required
  RETRY_ATTEMPTS: 2, // Number of additional retry attempts for failed requests
  BATCH_SIZE: 100, // Batch size for processing workout requests
};

/**
 * Cache configuration for API response caching
 * @type {Object<number>}
 */
const CACHE_CONFIG = {
  TTL_SECONDS: 600, // Time-to-live for cache entries (10 minutes, max for CacheService)
  MAX_MEMORY_CACHE_SIZE: 100, // Maximum number of entries in memory cache
};

/**
 * Import timeout configuration to prevent execution time limit issues
 * @type {Object<number|string>}
 */
const IMPORT_CONFIG = {
  MAX_EXECUTION_TIME_MS: 5 * 60 * 1000, // 5 minutes - safety margin before 6-minute limit
  ACTIVE_TIMEOUT_MS: 10 * 60 * 1000, // 10 minutes - considers import stale if older
  HEARTBEAT_MS: 2 * 60 * 1000, // 2 minutes - how often to update timestamp
  PROGRESS_PROPERTY_KEY: "IMPORT_PROGRESS_STATE",
  ACTIVE_PROPERTY_KEY: "IMPORT_ACTIVE_STATE",
  DEFERRED_POST_PROCESSING_KEY: "DEFERRED_POST_PROCESSING",
};

/**
 * UI Configuration
 */

/**
 * Dialog dimensions configuration for HTML dialogs
 * @type {Object<number>}
 */
const DIALOG_DIMENSIONS = {
  DEFAULT_WIDTH: 500,
  DEFAULT_HEIGHT: 500,
  API_KEY_WIDTH: 510,
  API_KEY_HEIGHT: 570,
  ROUTINE_CREATED_WIDTH: 400,
  ROUTINE_CREATED_HEIGHT: 380,
  SIDEBAR_WIDTH: 300,
  SETUP_INSTRUCTIONS_WIDTH: 650,
  SETUP_INSTRUCTIONS_HEIGHT: 650,
  IMPORT_WEIGHT_WIDTH: 550,
  IMPORT_WEIGHT_HEIGHT: 670,
  DEV_API_MANAGER_WIDTH: 600,
  DEV_API_MANAGER_HEIGHT: 480,
  LOAD_ROUTINE_WIDTH: 400,
  LOAD_ROUTINE_HEIGHT: 410,
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
 * Weight Configuration
 */

/**
 * Weight validation and formatting configuration
 * @type {Object<number>}
 */
const WEIGHT_CONFIG = {
  MAX_WEIGHT_LBS: 1100,
  MAX_WEIGHT_STONE: 78.5,
  MAX_WEIGHT_KG: 500,
  PRECISION_DECIMALS: 2, // Number of decimal places for weight values
};

/**
 * Weight conversion factors for unit conversions
 * @type {Object<number>}
 */
const WEIGHT_CONVERSION = {
  LBS_TO_KG: 0.45359237,
  STONE_TO_KG: 6.35029,
};

/**
 * Developer Configuration
 */

/**
 * Developer-specific configuration
 * @type {Object<Array<string>>}
 */
const DEVELOPER_CONFIG = {
  EMAILS: ["gelbharttomer@gmail.com"],
};

/**
 * Sheet Structure Configuration
 */

/**
 * Sheet header definitions for each sheet type
 * Must match the order of columns in each sheet
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
 * @returns {SheetTheme} Theme object
 * @private
 */
const createTheme = (
  evenRowColor,
  borderColor,
  fontColor,
  oddRowColor = "#FFFFFF"
) => ({
  evenRowColor,
  oddRowColor,
  borderColor,
  fontColor,
});

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
