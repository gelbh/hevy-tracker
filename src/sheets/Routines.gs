/**
 * @typedef {Object} Routine
 * @property {string} id - Routine ID
 * @property {string} title - Routine title
 * @property {number|null} folder_id - Folder ID for organization
 * @property {string} updated_at - Last update timestamp (ISO 8601)
 * @property {string} created_at - Creation timestamp (ISO 8601)
 * @property {Array<RoutineExercise>} exercises - Array of exercises in the routine
 */

/**
 * @typedef {Object} RoutineExercise
 * @property {string} exercise_template_id - Exercise template ID
 * @property {string} title - Exercise name
 * @property {Array<RoutineSet>} sets - Array of sets for this exercise
 */

/**
 * @typedef {Object} RoutineSet
 * @property {string} type - Set type (e.g., "normal")
 * @property {number|null} weight_kg - Weight in kilograms
 * @property {number|null} reps - Number of reps
 * @property {number|null} distance_meters - Distance in meters
 * @property {number|null} duration_seconds - Duration in seconds
 * @property {Object|null} rep_range - Rep range with start and end
 * @property {number} rep_range.start - Starting rep count
 * @property {number} rep_range.end - Ending rep count
 */

/**
 * Functions for importing and managing workout routines.
 * @module Routines
 */

/**
 * Imports all workout routines from Hevy API into the Routines sheet
 * @returns {Promise<void>}
 */
async function importAllRoutines() {
  try {
    const manager = SheetManager.getOrCreate(ROUTINES_SHEET_NAME);
    manager.clearSheet();

    const processedRoutines = [];
    const processRoutinePage = async (routines) => {
      const routineData = routines.flatMap((routine) =>
        processRoutine(routine)
      );
      processedRoutines.push(...routineData);

      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ss.toast(
        `Processed ${processedRoutines.length} routine entries...`,
        "Processing Progress"
      );
    };

    const totalRoutines = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.ROUTINES,
      PAGE_SIZE.ROUTINES,
      processRoutinePage,
      "routines"
    );

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (processedRoutines.length > 0) {
      await updateRoutinesInSheet(manager.sheet, processedRoutines);
      ss.toast(
        `Imported ${totalRoutines} routines with ${processedRoutines.length} total entries!`,
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    } else {
      ss.toast(
        "No routine entries found to import.",
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    }

    manager.formatSheet();
    await syncLocalizedExerciseNames();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing routines",
      sheetName: ROUTINES_SHEET_NAME,
    });
  }
}

/**
 * Updates the sheet with processed routine data in batches
 * @private
 */
async function updateRoutinesInSheet(sheet, processedRoutines) {
  try {
    const batchSize = BATCH_CONFIG.DEFAULT_BATCH_SIZE;
    for (let i = 0; i < processedRoutines.length; i += batchSize) {
      const batch = processedRoutines.slice(i, i + batchSize);
      const startRow = i + 2;

      sheet
        .getRange(startRow, 1, batch.length, batch[0].length)
        .setValues(batch);

      if (i % (batchSize * 5) === 0) {
        Utilities.sleep(RATE_LIMIT.API_DELAY);
      }
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating routines in sheet",
      sheetName: sheet.getName(),
      totalEntries: processedRoutines.length,
    });
  }
}

/**
 * Creates an empty routine row (no exercises)
 * @param {Object} routine - Routine object
 * @returns {Array<Array>} Single row array
 * @private
 */
function createEmptyRoutineRow(routine) {
  return [
    [
      routine.id,
      routine.title,
      routine.folder_id ?? "",
      formatDate(routine.updated_at),
      formatDate(routine.created_at),
      "",
      "",
      "",
      "",
      "",
    ],
  ];
}

/**
 * Processes routine data into sheet format
 * @param {Object} routine - Routine object
 * @returns {Array<Array>} Array of row data
 * @private
 */
function processRoutine(routine) {
  try {
    if (!routine.exercises?.length) {
      return createEmptyRoutineRow(routine);
    }

    return routine.exercises.flatMap((exercise) =>
      processRoutineExercise(exercise, routine)
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing routine",
      routineId: routine.id,
      routineTitle: routine.title,
    });
  }
}

/**
 * Processes a single exercise within a routine
 * @private
 */
function processRoutineExercise(exercise, routine) {
  try {
    return exercise.sets.map((set) => [
      routine.id,
      routine.title,
      routine.folder_id || "",
      formatDate(routine.updated_at),
      formatDate(routine.created_at),
      exercise.title,
      normalizeSetType(set.type),
      normalizeWeight(set.weight_kg),
      normalizeNumber(set.reps ?? set.distance_meters),
      normalizeNumber(set.duration_seconds),
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing routine exercise",
      routineId: routine.id,
      exerciseTitle: exercise.title,
    });
  }
}
