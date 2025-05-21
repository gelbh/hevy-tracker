/**
 * Functions for importing and managing workout routines.
 */

/**
 * Imports all workout routines from Hevy API into the Routines sheet.
 */
async function importAllRoutines() {
  try {
    const manager = SheetManager.getOrCreate(ROUTINES_SHEET_NAME);
    const sheet = manager.sheet;

    const processedRoutines = [];
    const processRoutinePage = async (routines) => {
      const routineData = routines.flatMap((routine) =>
        processRoutine(routine)
      );
      processedRoutines.push(...routineData);

      showToast(
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

    if (processedRoutines.length > 0) {
      await updateRoutinesInSheet(sheet, processedRoutines);
      showToast(
        `Imported ${totalRoutines} routines with ${processedRoutines.length} total entries!`,
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    } else {
      showToast(
        "No routine entries found to import.",
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    }

    manager.formatSheet();
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
    const batchSize = RATE_LIMIT.BATCH_SIZE;
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
 * Processes routine data into sheet format
 * @private
 */
function processRoutine(routine) {
  try {
    if (!routine.exercises || routine.exercises.length === 0) {
      return [
        [
          routine.id,
          routine.title,
          routine.folder_id || "",
          formatDate(routine.updated_at),
          formatDate(routine.created_at),
          "", // Exercise
          "", // Set Type
          "", // Weight
          "", // Reps / Distance (m)
          "", // Duration (s)
        ],
      ];
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
