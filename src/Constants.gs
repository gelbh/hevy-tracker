const CONSTANTS = {
  // Debug Mode
  DEBUG_MODE: false,

  // Sheet Names
  WORKOUTS_SHEET_NAME: "Workouts",
  EXERCISES_SHEET_NAME: "Exercises",
  ROUTINES_SHEET_NAME: "Routines",
  ROUTINE_FOLDERS_SHEET_NAME: "Routine Folders",
  WEIGHT_SHEET_NAME: "Weight History",

  // API Configuration
  API_ENDPOINTS: {
    BASE: "https://api.hevyapp.com/v1",
    WORKOUTS: "/workouts",
    WORKOUTS_EVENTS: "/workouts/events",
    ROUTINES: "/routines",
    EXERCISES: "/exercise_templates",
    ROUTINE_FOLDERS: "/routine_folders",
  },

  // Page Sizes
  PAGE_SIZE: {
    WORKOUTS: 10,
    ROUTINES: 10,
    EXERCISES: 100,
    ROUTINE_FOLDERS: 10,
  },

  // Rate Limiting
  RATE_LIMIT: {
    API_DELAY: 50,
    BATCH_SIZE: 100,
    MAX_RETRIES: 5,
    BACKOFF_MULTIPLIER: 2,
  },

  // Toast Configuration
  TOAST_DURATION: {
    SHORT: 3,
    NORMAL: 5,
    LONG: 8,
  },

  // Sheet Themes
  SHEET_THEMES: {
    [WORKOUTS_SHEET_NAME]: {
      evenRowColor: "#E6F3FF",
      oddRowColor: "#FFFFFF",
      borderColor: "#B3D9FF",
      fontColor: "#2C5777",
    },
    [EXERCISES_SHEET_NAME]: {
      evenRowColor: "#E8F5E9",
      oddRowColor: "#FFFFFF",
      borderColor: "#C8E6C9",
      fontColor: "#2E7D32",
    },
    [ROUTINES_SHEET_NAME]: {
      evenRowColor: "#FFF3E0",
      oddRowColor: "#FFFFFF",
      borderColor: "#FFE0B2",
      fontColor: "#E65100",
    },
    [ROUTINE_FOLDERS_SHEET_NAME]: {
      evenRowColor: "#E0F2F1",
      oddRowColor: "#FFFFFF",
      borderColor: "#B2DFDB",
      fontColor: "#00695C",
    },
    [WEIGHT_SHEET_NAME]: {
      evenRowColor: "#F3E5F5",
      oddRowColor: "#FFFFFF",
      borderColor: "#E1BEE7",
      fontColor: "#6A1B9A",
    },
  },

  // The AUTHORIZED_API_KEY will be added here during deployment
};

// Export all constants as individual variables
Object.entries(CONSTANTS).forEach(([key, value]) => {
  global[key] = value;
});
