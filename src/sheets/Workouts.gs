/**
 * Functions for importing and managing workout data.
 */

/**
 * Imports all workouts from Hevy API and populates the 'Workouts' sheet.
 * Handles updates and deletions through events API.
 */
async function importAllWorkouts() {
  try {
    const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
    const sheet = manager.sheet;
    const properties = getUserProperties();

    if (!sheet.getRange("A2").getValue()) {
      properties.deleteProperty("LAST_WORKOUT_UPDATE");
    }

    const existingData = getExistingWorkouts(sheet);
    const processedWorkouts = [];
    const deletedWorkoutIds = new Set();

    const processWorkoutPage = async (events) => {
      if (!events) return;

      events.forEach((event) => {
        if (
          event.type === "updated" &&
          !shouldSkipWorkout(event.workout, existingData)
        ) {
          processedWorkouts.push(event.workout);
        } else if (event.type === "deleted") {
          deletedWorkoutIds.add(event.id);
        }
      });
    };

    const lastUpdate =
      properties.getProperty("LAST_WORKOUT_UPDATE") || "2000-01-01T00:00:00Z";

    await apiClient.fetchPaginatedData(
      API_ENDPOINTS.WORKOUTS_EVENTS,
      PAGE_SIZE.WORKOUTS,
      processWorkoutPage,
      "events",
      { since: lastUpdate }
    );

    if (deletedWorkoutIds.size > 0) {
      deleteWorkoutRows(sheet, deletedWorkoutIds);
    }

    if (processedWorkouts.length > 0) {
      const processedData = processWorkoutsData(processedWorkouts);
      updateWorkoutData(sheet, processedData);

      const now = new Date().toISOString();
      properties.setProperty("LAST_WORKOUT_UPDATE", now);

      showProgress(
        `Processed ${processedWorkouts.length} workouts (${deletedWorkoutIds.size} deleted)!`,
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    } else {
      showProgress(
        "No workout changes found.",
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    }

    await updateExerciseCounts(
      SheetManager.getOrCreate(EXERCISES_SHEET_NAME).sheet
    );

    manager.formatSheet();

    updateWeightUnitInHeaders();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing workouts",
      sheetName: WORKOUTS_SHEET_NAME,
    });
  }
}

/**
 * Gets existing workouts from the sheet along with their details
 * @private
 */
function getExistingWorkouts(sheet) {
  try {
    const existingData = new Map();
    if (sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      const headers = data.shift();
      const workoutIdIndex = headers.indexOf("ID");

      data.forEach((row) => {
        if (row[workoutIdIndex]) {
          existingData.set(row[workoutIdIndex], {
            id: row[workoutIdIndex],
            startTime: row[headers.indexOf("Start Time")],
            endTime: row[headers.indexOf("End Time")],
          });
        }
      });
    }
    return existingData;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting existing workouts",
      sheetName: sheet.getName(),
    });
  }
}

/**
 * Deletes workout rows from the sheet
 * @private
 */
function deleteWorkoutRows(sheet, workoutIds) {
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const workoutIdIndex = headers.indexOf("ID");

    const rowsToDelete = [];
    data.forEach((row, index) => {
      if (workoutIds.has(row[workoutIdIndex])) {
        rowsToDelete.unshift(index + 2);
      }
    });

    if (rowsToDelete.length > 0) {
      rowsToDelete.forEach((row) => sheet.deleteRow(row));
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Deleting workout rows",
      sheetName: sheet.getName(),
      affectedIds: Array.from(workoutIds),
    });
  }
}

/**
 * Updates workout data in the sheet
 * @private
 */
function updateWorkoutData(sheet, processedData) {
  try {
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const workoutIdIndex = headers.indexOf("ID");
    const workoutRows = new Map();

    data.forEach((row, index) => {
      if (row[workoutIdIndex]) {
        workoutRows.set(row[workoutIdIndex], index + 2);
      }
    });

    const updates = [];
    const additions = [];

    processedData.forEach((row) => {
      const workoutId = row[0];
      if (workoutRows.has(workoutId)) {
        updates.push({ row: workoutRows.get(workoutId), data: row });
      } else {
        additions.push(row);
      }
    });

    if (updates.length > 0) {
      updates.forEach(({ row, data }) => {
        sheet.getRange(row, 1, 1, data.length).setValues([data]);
      });
    }

    if (additions.length > 0) {
      sheet.insertRowsBefore(2, additions.length);
      sheet
        .getRange(2, 1, additions.length, additions[0].length)
        .setValues(additions);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating workout data",
      sheetName: sheet.getName(),
      updateCount: updates?.length || 0,
      additionCount: additions?.length || 0,
    });
  }
}

/**
 * Processes workout data into a format suitable for the sheet
 * @private
 */
function processWorkoutsData(workouts) {
  try {
    return workouts.flatMap((workout) => {
      if (!workout.exercises || workout.exercises.length === 0) {
        return [
          [
            workout.id,
            workout.title,
            formatDate(workout.start_time),
            formatDate(workout.end_time),
            "", // Exercise
            "", // Set Type
            "", // Weight
            "", // Reps
            "", // Distance
            "", // Duration
            "", // RPE
          ],
        ];
      }

      return workout.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => [
          workout.id,
          workout.title,
          formatDate(workout.start_time),
          formatDate(workout.end_time),
          exercise.title,
          normalizeSetType(set.type),
          normalizeWeight(set.weight_kg),
          normalizeNumber(set.reps),
          normalizeNumber(set.distance_meters),
          normalizeNumber(set.duration_seconds),
          normalizeNumber(set.rpe),
        ])
      );
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing workout data",
      workoutCount: workouts.length,
    });
  }
}

/**
 * Determines if a workout should be skipped based on existing data
 * @param {Object} workout - Workout object from API
 * @param {Map} existingData - Map of existing workout data
 * @return {boolean} True if workout should be skipped
 */
function shouldSkipWorkout(workout, existingData) {
  const existingWorkout = existingData.get(workout.id);
  if (!existingWorkout) return false;

  const startTime = formatDate(workout.start_time);
  const endTime = formatDate(workout.end_time);

  return (
    startTime === existingWorkout.startTime &&
    endTime === existingWorkout.endTime
  );
}
