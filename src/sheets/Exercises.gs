/**
 * @typedef {Object} ExerciseTemplate
 * @property {string} id - Exercise template ID
 * @property {string} title - Exercise name
 * @property {string} type - Exercise type (e.g., "weight_reps")
 * @property {string} primary_muscle_group - Primary muscle group
 * @property {Array<string>} secondary_muscle_groups - Secondary muscle groups
 * @property {boolean} is_custom - Whether this is a custom exercise
 */

/**
 * Functions for importing and managing exercise data.
 * @module Exercises
 */

/**
 * Imports all exercises from Hevy API and populates the 'Exercises' sheet.
 * Only adds new exercises while preserving existing ones.
 * New exercises are added just before the last row and all exercises are sorted by count.
 * Exercise counts are always recalculated even if no new exercises are imported.
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function importAllExercises(checkTimeout = null) {
  try {
    const manager = SheetManager.getOrCreate(EXERCISES_SHEET_NAME);
    const sheet = manager.sheet;

    const existingData = getExistingExercises(sheet);
    const allApiExercises = [];
    const processedExercises = [];

    const processExercisePage = async (exercises) => {
      allApiExercises.push(...exercises);

      const newExercises = exercises.filter(
        (exercise) => !shouldSkipExercise(exercise, existingData)
      );

      if (newExercises.length > 0) {
        const processedData = processExercisesData(newExercises);
        processedExercises.push(...processedData);
      }
    };

    await apiClient.fetchPaginatedData(
      API_ENDPOINTS.EXERCISES,
      PAGE_SIZE.EXERCISES,
      processExercisePage,
      "exercise_templates",
      {},
      checkTimeout
    );

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getId() !== TEMPLATE_SPREADSHEET_ID) {
      syncCustomExerciseIds(sheet, allApiExercises);
    }

    if (processedExercises.length > 0) {
      await insertNewExercises(sheet, processedExercises);
    }

    const updateMessage =
      processedExercises.length > 0
        ? `Imported ${processedExercises.length} new exercises. `
        : "No new exercises found. ";

    await handlePostProcessing(sheet, checkTimeout, updateMessage);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing exercises",
      sheetName: EXERCISES_SHEET_NAME,
    });
  }
}

/**
 * Handles post-processing operations with timeout error handling
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The exercise sheet
 * @param {Function} checkTimeout - Timeout checker function
 * @param {string} updateMessage - Message to display
 * @private
 */
async function handlePostProcessing(sheet, checkTimeout, updateMessage) {
  try {
    await updateExerciseCounts(sheet, checkTimeout);
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("updateExerciseCounts timed out during exercise import");
    } else {
      throw error;
    }
  }

  try {
    await SheetManager.getOrCreate(EXERCISES_SHEET_NAME).formatSheet(
      checkTimeout
    );
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("formatSheet timed out during exercise import");
    } else {
      throw error;
    }
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `${updateMessage}Updated counts for all exercises!`,
    "Import Complete",
    TOAST_DURATION.NORMAL
  );
}

/**
 * Syncs IDs for any custom exercises in the sheet.
 * For each row where "Is Custom" is TRUE:
 *  • if an API exercise with the same title exists, set the ID to its API ID
 *  • otherwise set the ID to "N/A"
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The Exercises sheet
 * @param {{id:string,title:string}[]} apiExercises Array of all exercises from the API
 */
function syncCustomExerciseIds(sheet, apiExercises) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf("ID") + 1;
  const titleCol = headers.indexOf("Title") + 1;

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1 || lastColumn === 0) return;

  const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  const newIds = data.map((row) => {
    const match = apiExercises.find(
      (ex) => ex.title.toLowerCase() === String(row[titleCol - 1]).toLowerCase()
    );
    return [match ? match.id : "N/A"];
  });

  sheet.getRange(2, idCol, newIds.length, 1).setValues(newIds);
}

/**
 * Gets existing exercises from the sheet along with their details
 * @private
 */
function getExistingExercises(sheet) {
  try {
    const existingDataById = new Map();
    const existingDataByTitle = new Map();

    if (sheet.getLastRow() <= 1) {
      return {
        byId: existingDataById,
        byTitle: existingDataByTitle,
      };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const indices = {
      id: headers.indexOf("ID"),
      title: headers.indexOf("Title"),
      rank: headers.indexOf("Rank"),
    };

    data.forEach((row) => {
      const id = String(row[indices.id] || "").trim();
      const title = String(row[indices.title] || "").trim();
      const hasRank = row[indices.rank] !== "";

      const exerciseData = { id, title, hasRank };

      if (id && id !== "N/A") {
        existingDataById.set(id, exerciseData);
      }
      if (title) {
        existingDataByTitle.set(title.toLowerCase(), exerciseData);
      }
    });

    return {
      byId: existingDataById,
      byTitle: existingDataByTitle,
    };
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting existing exercises",
      sheetName: sheet.getName(),
    });
  }
}

/**
 * Processes exercise data into a format suitable for the sheet
 * @param {Object[]} exercises - Array of exercise objects from API
 * @return {Array[]} Processed data ready for sheet insertion
 */
function processExercisesData(exercises) {
  try {
    const isTemplate =
      SpreadsheetApp.getActiveSpreadsheet().getId() === TEMPLATE_SPREADSHEET_ID;
    return exercises.map((exercise) => [
      isTemplate ? "" : exercise.id,
      exercise.title,
      "", // IMG
      exercise.type || "",
      toTitleCaseFromSnake(exercise.primary_muscle_group),
      arrayToTitleCase(exercise.secondary_muscle_groups),
      exercise.is_custom ? "TRUE" : "FALSE",
      0, // Count
      "", // Rank
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing exercise data",
      exerciseCount: exercises.length,
    });
  }
}

/**
 * Determines if an exercise should be skipped based on existing data.
 * Checks by ID first, then by title (with English translation fallback).
 * @param {Object} exercise - Exercise object from API
 * @param {Object} existingData - Object with byId and byTitle Maps
 * @return {boolean} True if exercise should be skipped
 */
function shouldSkipExercise(exercise, existingData) {
  // Check by ID first (most reliable)
  if (exercise.id && existingData.byId.has(exercise.id)) {
    return true;
  }

  // Check by title (exact match)
  const titleKey = exercise.title.toLowerCase();
  if (existingData.byTitle.has(titleKey)) {
    return true;
  }

  // Check by English translation (fallback)
  const englishTitle = getEnglishName(exercise.title);
  if (englishTitle !== exercise.title) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (existingData.byTitle.has(englishTitleKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Handles post-processing operations with timeout error handling
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The exercise sheet
 * @param {SheetManager} manager - The sheet manager
 * @param {Function} checkTimeout - Timeout checker function
 * @private
 */
async function handlePostProcessingWithTimeout(sheet, manager, checkTimeout) {
  try {
    await updateExerciseCounts(sheet, checkTimeout);
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("updateExerciseCounts timed out during exercise import");
    } else {
      throw error;
    }
  }

  try {
    await manager.formatSheet(checkTimeout);
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("formatSheet timed out during exercise import");
    } else {
      throw error;
    }
  }
}

/**
 * Appends new exercises at the end of the sheet.
 * @private
 */
async function insertNewExercises(sheet, processedExercises) {
  try {
    const startRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(
      startRow,
      1,
      processedExercises.length,
      processedExercises[0].length
    );
    range.setValues(processedExercises);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Appending new exercises",
      sheetName: sheet.getName(),
      exerciseCount: processedExercises.length,
    });
  }
}

/**
 * Checks if timeout is approaching and throws ImportTimeoutError if so
 * @param {Function} checkTimeout - Timeout checker function
 * @param {string} operationName - Name of operation for error message
 * @param {string} [context] - Additional context for error message
 * @private
 */
function checkAndThrowTimeout(checkTimeout, operationName, context = "") {
  if (checkTimeout && checkTimeout()) {
    ImportProgressTracker.markDeferredOperation(operationName);
    const message = context
      ? `Timeout approaching during ${operationName}: ${context}`
      : `Timeout approaching during ${operationName}`;
    throw new ImportTimeoutError(message);
  }
}

/**
 * Increments count for an exercise by title with English translation fallback
 * @param {string} exerciseTitle - Exercise title
 * @param {Map} titleToIdMap - Map of title to ID
 * @param {Map} exerciseCountsByTitle - Map of title to count
 * @private
 */
function incrementTitleBasedCount(
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

/**
 * Updates exercise counts based on workout data using batched processing.
 * Matches exercises by exercise_template_id first, then falls back to title matching.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function updateExerciseCounts(exerciseSheet, checkTimeout = null) {
  const workoutSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORKOUTS_SHEET_NAME);

  if (!workoutSheet) {
    return;
  }

  try {
    const { exerciseData, idToTitleMap, titleToIdMap, indices } =
      buildExerciseMaps(exerciseSheet);

    const { workoutData, workoutIndices } = buildWorkoutMaps(workoutSheet);

    const { exerciseCountsById, exerciseCountsByTitle } = countExercises(
      workoutData,
      workoutIndices,
      idToTitleMap,
      titleToIdMap,
      checkTimeout
    );

    await updateExerciseSheetCounts(
      exerciseSheet,
      exerciseData,
      exerciseCountsById,
      exerciseCountsByTitle,
      checkTimeout
    );

    ImportProgressTracker.markOperationComplete("updateExerciseCounts");
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      ImportProgressTracker.markDeferredOperation("updateExerciseCounts");
    }
    throw ErrorHandler.handle(error, {
      operation: "Updating exercise counts",
      sheetName: exerciseSheet.getName(),
    });
  }
}

/**
 * Builds maps from exercise sheet data
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @returns {Object} Maps and indices for exercise data
 * @private
 */
function buildExerciseMaps(exerciseSheet) {
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseHeaders = exerciseData.shift();
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

/**
 * Builds maps from workout sheet data
 * @param {GoogleAppsScript.Spreadsheet.Sheet} workoutSheet - The workout sheet
 * @returns {Object} Workout data and indices
 * @private
 */
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

/**
 * Counts exercises from workout data
 * @param {Array} workoutData - Array of workout rows
 * @param {Object} indices - Column indices
 * @param {Map} idToTitleMap - Map of exercise ID to title
 * @param {Map} titleToIdMap - Map of title to exercise ID
 * @param {Function} checkTimeout - Timeout checker
 * @returns {Object} Maps of exercise counts
 * @private
 */
function countExercises(
  workoutData,
  indices,
  idToTitleMap,
  titleToIdMap,
  checkTimeout
) {
  const exerciseCountsById = new Map();
  const exerciseCountsByTitle = new Map();
  const processedWorkouts = new Set();
  const batchSize = BATCH_CONFIG.EXERCISE_COUNT_BATCH_SIZE;
  const timeoutCheckInterval = 200;

  for (let i = 0; i < workoutData.length; i += batchSize) {
    checkAndThrowTimeout(checkTimeout, "updateExerciseCounts");

    const batch = workoutData.slice(
      i,
      Math.min(i + batchSize, workoutData.length)
    );

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
      const globalIndex = i + batchIndex;
      if (
        globalIndex > 0 &&
        globalIndex % timeoutCheckInterval === 0 &&
        checkTimeout &&
        checkTimeout()
      ) {
        checkAndThrowTimeout(checkTimeout, "updateExerciseCounts");
      }

      const row = batch[batchIndex];
      const workoutId = row[indices.workoutId];
      const exerciseTitle = String(row[indices.exercise] || "").trim();
      const exerciseTemplateId = String(
        row[indices.exerciseTemplateId] || ""
      ).trim();

      if (!exerciseTitle || !workoutId) continue;

      const key = `${workoutId}_${exerciseTemplateId || exerciseTitle}`;
      if (processedWorkouts.has(key)) continue;

      processedWorkouts.add(key);

      if (exerciseTemplateId && idToTitleMap.has(exerciseTemplateId)) {
        exerciseCountsById.set(
          exerciseTemplateId,
          (exerciseCountsById.get(exerciseTemplateId) || 0) + 1
        );
      } else {
        incrementTitleCount(exerciseTitle, titleToIdMap, exerciseCountsByTitle);
      }
    }

    if (i % (batchSize * 5) === 0) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }

  return { exerciseCountsById, exerciseCountsByTitle };
}

/**
 * Increments count for an exercise by title
 * @param {string} exerciseTitle - Exercise title
 * @param {Map} titleToIdMap - Map of title to ID
 * @param {Map} exerciseCountsByTitle - Map of title to count
 * @private
 */
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

/**
 * Updates exercise sheet with calculated counts
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Array} exerciseData - Exercise data array
 * @param {Map} exerciseCountsById - Map of ID to count
 * @param {Map} exerciseCountsByTitle - Map of title to count
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateExerciseSheetCounts(
  exerciseSheet,
  exerciseData,
  exerciseCountsById,
  exerciseCountsByTitle,
  checkTimeout
) {
  const batchSize = BATCH_CONFIG.EXERCISE_COUNT_BATCH_SIZE;
  const timeoutCheckInterval = 200;
  const { idIndex, titleIndex, countIndex } =
    buildExerciseMaps(exerciseSheet).indices;

  for (let i = 0; i < exerciseData.length; i += batchSize) {
    checkAndThrowTimeout(checkTimeout, "updateExerciseCounts");

    const batch = exerciseData.slice(
      i,
      Math.min(i + batchSize, exerciseData.length)
    );

    if (
      i > 0 &&
      i % timeoutCheckInterval === 0 &&
      checkTimeout &&
      checkTimeout()
    ) {
      checkAndThrowTimeout(checkTimeout, "updateExerciseCounts");
    }

    const updateRange = exerciseSheet.getRange(
      i + 2,
      countIndex + 1,
      batch.length,
      1
    );

    const counts = batch.map((row) => {
      const id = String(row[idIndex] || "").trim();
      const title = String(row[titleIndex] || "").trim();

      if (id && id !== "N/A" && exerciseCountsById.has(id)) {
        return [exerciseCountsById.get(id)];
      }

      if (title) {
        if (exerciseCountsByTitle.has(title)) {
          return [exerciseCountsByTitle.get(title)];
        }

        const englishTitle = getEnglishName(title);
        if (englishTitle !== title && exerciseCountsByTitle.has(englishTitle)) {
          return [exerciseCountsByTitle.get(englishTitle)];
        }
      }

      return [0];
    });

    updateRange.setValues(counts);

    if (i % (batchSize * 5) === 0) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }
}

/**
 * Syncs localized exercise names across all sheets.
 * First updates Exercises sheet with localized names from workouts (by ID).
 * Then scans all sheets and replaces hardcoded exercise names (non-formula) with localized names.
 * @param {Map<string, string>} [idToLocalizedName] - Optional map of exercise_template_id -> localized name.
 *   If provided, avoids reading workout data from sheet (performance optimization).
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function syncLocalizedExerciseNames(
  idToLocalizedName = null,
  checkTimeout = null
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const workoutSheet = ss.getSheetByName(WORKOUTS_SHEET_NAME);
  const exerciseSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);

  if (!workoutSheet || workoutSheet.getLastRow() <= 1) return;
  if (!exerciseSheet || exerciseSheet.getLastRow() <= 1) return;

  try {
    const localizedMap =
      idToLocalizedName || buildLocalizedNameMapFromSheet(workoutSheet);

    if (localizedMap.size === 0) return;

    checkAndThrowTimeout(checkTimeout, "syncLocalizedExerciseNames");

    const { exerciseData, exerciseNameToLocalized, nameToExerciseId } =
      buildExerciseNameMaps(exerciseSheet, localizedMap);

    await updateExercisesSheetNames(exerciseSheet, exerciseData, localizedMap);

    await updateSheetRangesWithLocalizedNames(
      ss,
      exerciseNameToLocalized,
      nameToExerciseId,
      localizedMap,
      checkTimeout
    );

    ImportProgressTracker.markOperationComplete("syncLocalizedExerciseNames");
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      ImportProgressTracker.markDeferredOperation("syncLocalizedExerciseNames");
    }
    throw ErrorHandler.handle(error, {
      operation: "Syncing localized exercise names across all sheets",
    });
  }
}

/**
 * Builds localized name map from workout sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} workoutSheet - The workout sheet
 * @returns {Map} Map of exercise ID to localized name
 * @private
 */
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

/**
 * Builds exercise name maps for localization
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @returns {Object} Maps for name lookups
 * @private
 */
function buildExerciseNameMaps(exerciseSheet, idToLocalizedName) {
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseHeaders = exerciseData.shift();
  const idIndex = exerciseHeaders.indexOf("ID");
  const titleIndex = exerciseHeaders.indexOf("Title");

  if (idIndex === -1 || titleIndex === -1) {
    return {
      exerciseData: [],
      exerciseNameToLocalized: new Map(),
      nameToExerciseId: new Map(),
    };
  }

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

      // Build reverse lookup map
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

/**
 * Updates Exercises sheet with localized names
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Array} exerciseData - Exercise data
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @private
 */
async function updateExercisesSheetNames(
  exerciseSheet,
  exerciseData,
  idToLocalizedName
) {
  const { exerciseUpdates, titleIndex } = buildExerciseNameMaps(
    exerciseSheet,
    idToLocalizedName
  );

  if (exerciseUpdates.length === 0) return;

  exerciseUpdates.sort((a, b) => a.row - b.row);

  const batches = [];
  let currentBatch = null;

  for (const update of exerciseUpdates) {
    if (
      !currentBatch ||
      update.row !== currentBatch.endRow + 1 ||
      update.row - currentBatch.startRow >= BATCH_CONFIG.SHEET_UPDATE_BATCH_SIZE
    ) {
      if (currentBatch) {
        batches.push(currentBatch);
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
    batches.push(currentBatch);
  }

  for (const batch of batches) {
    const range = exerciseSheet.getRange(
      batch.startRow,
      titleIndex + 1,
      batch.values.length,
      1
    );
    range.setValues(batch.values);
  }
}

/**
 * Updates exercise names in specific sheet ranges
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The spreadsheet
 * @param {Map} exerciseNameToLocalized - Map of exercise name to localized name
 * @param {Map} nameToExerciseId - Map of name to exercise ID
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateSheetRangesWithLocalizedNames(
  ss,
  exerciseNameToLocalized,
  nameToExerciseId,
  idToLocalizedName,
  checkTimeout
) {
  const rangesToUpdate = [
    { sheetName: "Strength Standards", column: 1, startRow: 2 },
    { sheetName: ROUTINES_SHEET_NAME, column: 6, startRow: 2 },
    { sheetName: EXERCISES_SHEET_NAME, column: 2, startRow: 2 },
  ];

  for (const rangeConfig of rangesToUpdate) {
    checkAndThrowTimeout(
      checkTimeout,
      "syncLocalizedExerciseNames",
      rangeConfig.sheetName
    );

    const sheet = ss.getSheetByName(rangeConfig.sheetName);
    if (!sheet || sheet.getLastRow() < rangeConfig.startRow) {
      continue;
    }

    try {
      await updateSheetRange(
        sheet,
        rangeConfig,
        exerciseNameToLocalized,
        nameToExerciseId,
        idToLocalizedName,
        checkTimeout
      );
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        throw error;
      }
      console.warn(
        `Error updating ${rangeConfig.sheetName} column ${rangeConfig.column}:`,
        error
      );
    }
  }
}

/**
 * Updates a specific sheet range with localized names
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update
 * @param {Object} rangeConfig - Range configuration
 * @param {Map} exerciseNameToLocalized - Map of exercise name to localized name
 * @param {Map} nameToExerciseId - Map of name to exercise ID
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateSheetRange(
  sheet,
  rangeConfig,
  exerciseNameToLocalized,
  nameToExerciseId,
  idToLocalizedName,
  checkTimeout
) {
  const exerciseCol = rangeConfig.column;
  const numRows = sheet.getLastRow();
  const batchSize = BATCH_CONFIG.SHEET_UPDATE_BATCH_SIZE;
  const timeoutCheckInterval = 200;

  for (
    let startRow = rangeConfig.startRow;
    startRow <= numRows;
    startRow += batchSize
  ) {
    checkAndThrowTimeout(
      checkTimeout,
      "syncLocalizedExerciseNames",
      rangeConfig.sheetName
    );

    const endRow = Math.min(startRow + batchSize - 1, numRows);
    const range = sheet.getRange(
      startRow,
      exerciseCol,
      endRow - startRow + 1,
      1
    );
    const values = range.getValues();
    const formulas = range.getFormulas();

    const updates = [];

    for (let r = 0; r < values.length; r++) {
      if (
        r > 0 &&
        r % timeoutCheckInterval === 0 &&
        checkTimeout &&
        checkTimeout()
      ) {
        checkAndThrowTimeout(
          checkTimeout,
          "syncLocalizedExerciseNames",
          rangeConfig.sheetName
        );
      }

      const cellValue = values[r][0];
      const cellFormula = formulas[r][0];

      if (cellFormula && cellFormula.trim() !== "") continue;
      if (!cellValue || String(cellValue).trim() === "") continue;

      const cellText = String(cellValue).trim();
      const cellKey = cellText.toLowerCase();
      let localizedName = null;

      if (exerciseNameToLocalized.has(cellKey)) {
        localizedName = exerciseNameToLocalized.get(cellKey);
      } else {
        const englishName = getEnglishName(cellText);
        if (englishName !== cellText) {
          const englishKey = englishName.toLowerCase();
          if (exerciseNameToLocalized.has(englishKey)) {
            localizedName = exerciseNameToLocalized.get(englishKey);
          }
        }

        if (!localizedName && nameToExerciseId.has(cellKey)) {
          const exerciseId = nameToExerciseId.get(cellKey);
          if (idToLocalizedName.has(exerciseId)) {
            localizedName = idToLocalizedName.get(exerciseId);
          }
        }
      }

      if (localizedName && localizedName !== cellText) {
        updates.push({
          row: startRow + r,
          value: localizedName,
        });
      }
    }

    if (updates.length > 0) {
      applyBatchedUpdates(sheet, updates, exerciseCol, batchSize);
    }

    if (startRow % (batchSize * 10) === 0) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }
}

/**
 * Applies batched updates to a sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet
 * @param {Array} updates - Array of update objects
 * @param {number} exerciseCol - Column number
 * @param {number} batchSize - Batch size
 * @private
 */
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
