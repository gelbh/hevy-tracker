/**
 * Data transformation utilities for converting workout API data to sheet format.
 * @module workouts/WorkoutDataProcessor
 */

/**
 * Creates a row for a workout without exercises
 * @param {Object} workout - Workout object
 * @returns {Array} Row data
 * @private
 */
function createEmptyWorkoutRow(workout) {
  return [
    workout.id,
    workout.title,
    formatDate(workout.start_time),
    formatDate(workout.end_time),
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ];
}

/**
 * Creates rows for a workout with exercises
 * @param {Object} workout - Workout object
 * @returns {Array<Array>} Array of row data
 * @private
 */
function createWorkoutRows(workout) {
  return workout.exercises.flatMap((ex) =>
    ex.sets.map((set) => [
      workout.id,
      workout.title,
      formatDate(workout.start_time),
      formatDate(workout.end_time),
      ex.title,
      ex.exercise_template_id || "",
      normalizeSetType(set.type),
      normalizeWeight(set.weight_kg),
      normalizeNumber(set.reps ?? set.distance_meters),
      normalizeNumber(set.duration_seconds),
      normalizeNumber(set.rpe),
    ])
  );
}

/**
 * Converts workout objects into 2D array of sheet rows
 * @param {Array<Object>} workouts - Array of workout objects
 * @returns {Array<Array>} 2D array of sheet rows
 * @private
 */
function processWorkoutsData(workouts) {
  try {
    return workouts.flatMap((workout) =>
      workout.exercises?.length
        ? createWorkoutRows(workout)
        : [createEmptyWorkoutRow(workout)]
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing workout data",
      workoutCount: workouts.length,
    });
  }
}
