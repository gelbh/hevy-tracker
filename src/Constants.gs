// Debug Mode
const DEBUG_MODE = false;

// Sheet Names
const WORKOUTS_SHEET_NAME = "Workouts";
const EXERCISES_SHEET_NAME = "Exercises";
const ROUTINES_SHEET_NAME = "Routines";
const ROUTINE_FOLDERS_SHEET_NAME = "Routine Folders";
const WEIGHT_SHEET_NAME = "Weight History";

// API Configuration
const API_ENDPOINTS = {
  BASE: "https://api.hevyapp.com/v1",
  WORKOUTS: "/workouts",
  WORKOUTS_EVENTS: "/workouts/events",
  ROUTINES: "/routines",
  EXERCISES: "/exercise_templates",
  ROUTINE_FOLDERS: "/routine_folders",
};

// Page Sizes
const PAGE_SIZE = {
  WORKOUTS: 10,
  ROUTINES: 10,
  EXERCISES: 100,
  ROUTINE_FOLDERS: 10,
};

// Rate Limiting
const RATE_LIMIT = {
  API_DELAY: 50,
  BATCH_SIZE: 100,
  MAX_RETRIES: 5,
  BACKOFF_MULTIPLIER: 2,
};

// Toast Configuration
const TOAST_DURATION = {
  SHORT: 3,
  NORMAL: 5,
  LONG: 8,
};

// Sheet Headers
const SHEET_HEADERS = {
  [WORKOUTS_SHEET_NAME]: [
    "ID",
    "Title",
    "Start Time",
    "End Time",
    "Exercise",
    "Set Type",
    "Weight (kg)",
    "Reps",
    "Distance (m)",
    "Duration (s)",
    "RPE",
  ],
  [ROUTINES_SHEET_NAME]: [
    "ID",
    "Title",
    "Folder ID",
    "Exercise",
    "Set Type",
    "Weight (kg)",
    "Reps",
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
  [ROUTINE_FOLDERS_SHEET_NAME]: ["ID", "Name"],
  [WEIGHT_SHEET_NAME]: ["Timestamp", "Weight (kg)"],
};

// Themes
const BLUE_THEME = {
  evenRowColor: "#E6F3FF",
  oddRowColor: "#FFFFFF",
  borderColor: "#B3D9FF",
  fontColor: "#2C5777",
};

const GREEN_THEME = {
  evenRowColor: "#E8F5E9",
  oddRowColor: "#FFFFFF",
  borderColor: "#C8E6C9",
  fontColor: "#2E7D32",
};

const PURPLE_THEME = {
  evenRowColor: "#F3E5F5",
  oddRowColor: "#FFFFFF",
  borderColor: "#E1BEE7",
  fontColor: "#6A1B9A",
};

const ORANGE_THEME = {
  evenRowColor: "#FFF3E0",
  oddRowColor: "#FFFFFF",
  borderColor: "#FFE0B2",
  fontColor: "#E65100",
};

const GRAY_THEME = {
  evenRowColor: "#F5F5F5",
  oddRowColor: "#FFFFFF",
  borderColor: "#E0E0E0",
  fontColor: "#424242",
};

const TEAL_THEME = {
  evenRowColor: "#E0F2F1",
  oddRowColor: "#FFFFFF",
  borderColor: "#B2DFDB",
  fontColor: "#00695C",
};

const RED_THEME = {
  evenRowColor: "#FFEBEE",
  oddRowColor: "#FFFFFF",
  borderColor: "#FFCDD2",
  fontColor: "#B71C1C",
};

const YELLOW_THEME = {
  evenRowColor: "#FFFDE7",
  oddRowColor: "#FFFFFF",
  borderColor: "#FFF9C4",
  fontColor: "#F57F17",
};

// Theme Mapping
const SHEET_THEMES = {
  [WORKOUTS_SHEET_NAME]: BLUE_THEME,
  [EXERCISES_SHEET_NAME]: GREEN_THEME,
  [ROUTINES_SHEET_NAME]: RED_THEME,
  [ROUTINE_FOLDERS_SHEET_NAME]: TEAL_THEME,
  [WEIGHT_SHEET_NAME]: PURPLE_THEME,
};

// Authorized API Key (set by deployment)
const AUTHORIZED_API_KEY = "";
