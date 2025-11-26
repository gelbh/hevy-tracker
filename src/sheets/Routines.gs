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

    manager.clearSheet();

    const processedRoutines = [];
    const processRoutinePage = async (routines) => {
      const routineData = routines.flatMap((routine) =>
        processRoutine(routine)
      );
      processedRoutines.push(...routineData);

      SpreadsheetApp.getActiveSpreadsheet().toast(
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
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Imported ${totalRoutines} routines with ${processedRoutines.length} total entries!`,
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    } else {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "No routine entries found to import.",
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    }

    manager.formatSheet();
    
    // Sync exercise names from workouts to match localized names
    await syncRoutineExerciseNamesFromWorkouts(sheet);
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

/**
 * Syncs exercise names from the Exercises sheet to the Routines sheet.
 * Replaces exercise names in routines with localized names from Exercises sheet when available.
 * Uses Exercises sheet as source of truth for localized names (already synced from workouts).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} routineSheet - The routines sheet
 */
async function syncRoutineExerciseNamesFromWorkouts(routineSheet) {
  const exerciseSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EXERCISES_SHEET_NAME);

  if (!exerciseSheet || exerciseSheet.getLastRow() <= 1) {
    return;
  }

  try {
    // Build map of exercise name -> localized name from Exercises sheet
    const exerciseData = exerciseSheet.getDataRange().getValues();
    const exerciseHeaders = exerciseData.shift();
    const titleIndex = exerciseHeaders.indexOf("Title");

    if (titleIndex === -1) {
      return; // Column doesn't exist
    }

    // Get all exercise names from Exercises sheet (these are already localized)
    const exerciseNameMap = new Map();
    exerciseData.forEach((row) => {
      const localizedName = String(row[titleIndex] || "").trim();
      if (localizedName) {
        // Use lowercase key for case-insensitive matching
        exerciseNameMap.set(localizedName.toLowerCase(), localizedName);
      }
    });

    if (exerciseNameMap.size === 0) {
      return; // No exercises to sync
    }

    // Update routine sheet with localized names from Exercises sheet
    const routineData = routineSheet.getDataRange().getValues();
    const routineHeaders = routineData.shift();
    const exerciseIndex = routineHeaders.indexOf("Exercise");

    if (exerciseIndex === -1) {
      return;
    }

    const updates = [];
    routineData.forEach((row, rowIndex) => {
      const currentExerciseName = String(row[exerciseIndex] || "").trim();
      
      if (currentExerciseName) {
        const exerciseKey = currentExerciseName.toLowerCase();
        
        // Check if we have a localized name for this exercise in Exercises sheet
        if (exerciseNameMap.has(exerciseKey)) {
          const localizedName = exerciseNameMap.get(exerciseKey);
          // Only update if the name is different
          if (localizedName !== currentExerciseName) {
            updates.push({
              row: rowIndex + 2, // +2 because we removed header and arrays are 0-indexed
              name: localizedName,
            });
          }
        }
      }
    });

    // Batch update exercise names
    if (updates.length > 0) {
      const batchSize = 1000;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, Math.min(i + batchSize, updates.length));
        
        batch.forEach((update) => {
          routineSheet.getRange(update.row, exerciseIndex + 1).setValue(update.name);
        });

        if (i % (batchSize * 5) === 0) {
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      }
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Syncing routine exercise names from Exercises sheet",
      sheetName: routineSheet.getName(),
    });
  }
}
