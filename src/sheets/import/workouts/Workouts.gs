/**
 * @typedef {Object} Workout
 * @property {string} id - Workout ID
 * @property {string} title - Workout title
 * @property {string} start_time - Workout start time (ISO 8601)
 * @property {string} [end_time] - Workout end time (ISO 8601)
 * @property {Array<WorkoutExercise>} exercises - Array of exercises in the workout
 */

/**
 * @typedef {Object} WorkoutExercise
 * @property {string} exercise_template_id - Exercise template ID
 * @property {string} title - Exercise name
 * @property {Array<WorkoutSet>} sets - Array of sets for this exercise
 */

/**
 * @typedef {Object} WorkoutSet
 * @property {string} type - Set type (e.g., "normal")
 * @property {number|null} weight_kg - Weight in kilograms
 * @property {number|null} reps - Number of reps
 * @property {number|null} distance_meters - Distance in meters (for cardio)
 * @property {number|null} duration_seconds - Duration in seconds
 * @property {number|null} rpe - Rate of Perceived Exertion
 */

/**
 * Functions for importing and managing workout data.
 * @module workouts/Workouts
 */

/**
 * Gets the last workout update timestamp
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The workouts sheet
 * @returns {string|false} Last update timestamp or false if no data
 * @private
 */
const getLastWorkoutUpdate = (sheet) => {
  const properties = getDocumentProperties();
  const lastUpdate = properties?.getProperty("LAST_WORKOUT_UPDATE");

  if (lastUpdate) {
    return lastUpdate;
  }

  if (sheet.getLastRow() > 1 && sheet.getRange("A2").getValue()) {
    return false;
  }

  return false;
};

/**
 * Synchronizes workout data to the 'Workouts' sheet.
 * - First run: full import of all workouts.
 * - Subsequent runs: delta import of only new/changed/deleted events.
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<number>} Number of changes made
 */
async function importAllWorkouts(checkTimeout = null) {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const lastUpdate = getLastWorkoutUpdate(manager.sheet);

  const changes = lastUpdate
    ? await importAllWorkoutsDelta(lastUpdate, checkTimeout)
    : await importAllWorkoutsFull(checkTimeout);

  if (changes > 0) {
    const exerciseSheet = SheetManager.getOrCreate(EXERCISES_SHEET_NAME).sheet;

    try {
      await updateExerciseCounts(exerciseSheet, checkTimeout);
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        console.warn("updateExerciseCounts timed out, continuing...");
      } else {
        throw error;
      }
    }

    try {
      await manager.formatSheet(checkTimeout);
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        console.warn("formatSheet timed out, continuing...");
      } else {
        throw error;
      }
    }
  }

  return changes;
}

/**
 * Extracts localized exercise names from workouts
 * @param {Array<Object>} workouts - Array of workout objects
 * @param {Map<string, string>} idToLocalizedName - Map to populate
 * @private
 */
function _extractLocalizedExerciseNames(workouts, idToLocalizedName) {
  workouts.forEach((workout) => {
    if (!workout.exercises || !Array.isArray(workout.exercises)) {
      return;
    }

    workout.exercises.forEach((exercise) => {
      const exerciseTemplateId = exercise.exercise_template_id;
      const localizedTitle = exercise.title;
      if (
        exerciseTemplateId &&
        localizedTitle &&
        exerciseTemplateId !== "N/A"
      ) {
        idToLocalizedName.set(exerciseTemplateId, localizedTitle);
      }
    });
  });
}

/**
 * Writes rows to sheet starting at specified row
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet to write to
 * @param {Array<Array>} rows - Rows to write
 * @param {number} startRow - Starting row number
 * @returns {number} Number of rows written
 * @private
 */
function _writeRowsToSheet(sheet, rows, startRow) {
  if (rows.length === 0) {
    return 0;
  }

  const numCols = rows[0].length;
  sheet.getRange(startRow, 1, rows.length, numCols).setValues(rows);
  return rows.length;
}

/**
 * Performs a full import of all workouts.
 * Clears existing data rows (keeping headers), fetches all pages,
 * and writes rows incrementally as pages arrive.
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<number>} Number of workout records imported
 */
async function importAllWorkoutsFull(checkTimeout = null) {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const props = getDocumentProperties();
  props?.deleteProperty("LAST_WORKOUT_UPDATE");

  manager.clearSheet();

  let currentRow = 2;
  let totalRowsWritten = 0;
  const idToLocalizedName = new Map();
  const WRITE_BATCH_SIZE = 150;
  let pendingRows = [];

  await getApiClient().fetchPaginatedData(
    API_ENDPOINTS.WORKOUTS,
    PAGE_SIZE.WORKOUTS,
    async (workouts) => {
      if (!workouts || workouts.length === 0) {
        return;
      }

      const pageRows = processWorkoutsData(workouts);
      pendingRows.push(...pageRows);
      _extractLocalizedExerciseNames(workouts, idToLocalizedName);

      if (pendingRows.length >= WRITE_BATCH_SIZE) {
        const rowsToWrite = pendingRows.slice(0, WRITE_BATCH_SIZE);
        const remainingRows = pendingRows.slice(WRITE_BATCH_SIZE);

        const written = _writeRowsToSheet(
          manager.sheet,
          rowsToWrite,
          currentRow
        );
        currentRow += written;
        totalRowsWritten += written;
        pendingRows = remainingRows;
      }
    },
    "workouts",
    {},
    checkTimeout
  );

  if (pendingRows.length > 0) {
    const written = _writeRowsToSheet(manager.sheet, pendingRows, currentRow);
    totalRowsWritten += written;
  }

  props?.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
  const ss = getActiveSpreadsheet();
  ss.toast(
    `Imported ${totalRowsWritten} workout records.`,
    "Full Import Complete",
    TOAST_DURATION.NORMAL
  );

  if (idToLocalizedName.size > 0) {
    try {
      await syncLocalizedExerciseNames(idToLocalizedName, checkTimeout);
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        console.warn("syncLocalizedExerciseNames timed out after full import");
      } else {
        throw error;
      }
    }
  }

  return totalRowsWritten;
}

/**
 * Processes workout events into deleted and upsert ID sets
 * @param {Array} events - Array of workout events
 * @returns {Object} Object with deletedIds Set and upsertIds Array
 * @private
 */
function processWorkoutEvents(events) {
  const deletedIds = new Set();
  const upsertIds = [];

  for (const event of events) {
    if (event.type === "deleted") {
      const id = event.workout?.id ?? event.id;
      if (id) {
        deletedIds.add(id);
      }
    } else if (event.type === "updated" || event.type === "created") {
      const id = event.workout?.id;
      if (id) {
        upsertIds.push(id);
      }
    }
  }

  return { deletedIds, upsertIds };
}

/**
 * Imports only changed or new workouts since lastUpdate.
 * Fetches full workout details for every upsert event to ensure exercise/sets data.
 * @param {string} lastUpdate - ISO timestamp of last import
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<number>} Number of workouts imported
 */
async function importAllWorkoutsDelta(lastUpdate, checkTimeout = null) {
  try {
    const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
    const props = getDocumentProperties();
    if (!props) {
      throw new ConfigurationError(
        "Unable to access document properties. Please ensure you have proper permissions."
      );
    }

    const events = [];
    await getApiClient().fetchPaginatedData(
      API_ENDPOINTS.WORKOUTS_EVENTS,
      PAGE_SIZE.WORKOUTS,
      (page) => events.push(...page),
      "events",
      { since: lastUpdate },
      checkTimeout
    );

    if (!events.length) {
      const ss = getActiveSpreadsheet();
      ss.toast(
        "No new workout events found since last import.",
        "Delta Import Complete",
        TOAST_DURATION.NORMAL
      );
      return 0;
    }

    const { deletedIds, upsertIds } = processWorkoutEvents(events);

    if (deletedIds.size) {
      deleteWorkoutRows(manager.sheet, deletedIds);
    }

    if (!upsertIds.length) {
      props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
      return 0;
    }

    const apiKey = getApiClient().apiKeyManager.getApiKeyFromProperties();
    if (!apiKey) {
      throw new ConfigurationError("API key not found");
    }

    const { fullWorkouts, failedIds } = await _fetchWorkoutsInBatches(
      upsertIds,
      apiKey,
      checkTimeout
    );

    const rows = processWorkoutsData(fullWorkouts);
    updateWorkoutData(manager.sheet, rows);
    props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());

    const idToLocalizedName = new Map();
    fullWorkouts.forEach((workout) => {
      if (workout.exercises && Array.isArray(workout.exercises)) {
        workout.exercises.forEach((exercise) => {
          const exerciseTemplateId = exercise.exercise_template_id;
          const localizedTitle = exercise.title;
          if (
            exerciseTemplateId &&
            localizedTitle &&
            exerciseTemplateId !== "N/A"
          ) {
            idToLocalizedName.set(exerciseTemplateId, localizedTitle);
          }
        });
      }
    });

    const ss = getActiveSpreadsheet();
    let toastMessage = `Imported ${rows.length} workout records.`;
    if (failedIds.length > 0) {
      toastMessage += ` ${failedIds.length} workout(s) failed to import.`;
    }
    ss.toast(toastMessage, "Delta Import Complete", TOAST_DURATION.NORMAL);

    if (idToLocalizedName.size > 0) {
      try {
        await syncLocalizedExerciseNames(idToLocalizedName, checkTimeout);
      } catch (error) {
        if (error instanceof ImportTimeoutError) {
          console.warn(
            "syncLocalizedExerciseNames timed out after delta import"
          );
        } else {
          throw error;
        }
      }
    }

    return fullWorkouts.length;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing workout delta",
      sheetName: WORKOUTS_SHEET_NAME,
    });
  }
}
