/**
 * Functions for updating exercise counts based on workout data.
 * @module ExerciseCounts
 */

/**
 * Updates exercise counts based on workout data using batched processing.
 * Matches exercises by exercise_template_id first, then falls back to title matching.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function updateExerciseCounts(exerciseSheet, checkTimeout = null) {
  const ss = getActiveSpreadsheet();
  const workoutSheet = ss.getSheetByName(WORKOUTS_SHEET_NAME);

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
      indices,
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

  validateExerciseSheetHeaders(exerciseHeaders, ["ID", "Title", "Count"]);

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
 * Increments count for an exercise by title with English translation fallback
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
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Array} exerciseData - Exercise data array
 * @param {Map} exerciseCountsById - Map of ID to count
 * @param {Map} exerciseCountsByTitle - Map of title to count
 * @param {Object} indices - Object with idIndex, titleIndex, countIndex
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateExerciseSheetCounts(
  exerciseSheet,
  exerciseData,
  exerciseCountsById,
  exerciseCountsByTitle,
  indices,
  checkTimeout
) {
  const batchSize = BATCH_CONFIG.EXERCISE_COUNT_BATCH_SIZE;
  const timeoutCheckInterval = 200;
  const { idIndex, titleIndex, countIndex } = indices;

  if (countIndex < 0) {
    throw new ConfigurationError(
      "Count column not found in Exercises sheet. Please restore the sheet from the template.",
      {
        sheetName: exerciseSheet.getName(),
        missingColumn: "Count",
      }
    );
  }

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
