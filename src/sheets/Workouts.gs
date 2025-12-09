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
 * Requires shared constants and utilities defined elsewhere.
 * @module Workouts
 */

/**
 * Gets the last workout update timestamp
 * Optimized to check properties first (faster than reading sheet)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The workouts sheet
 * @returns {string|false} Last update timestamp or false if no data
 * @private
 */
const getLastWorkoutUpdate = (sheet) => {
  const properties = getDocumentProperties();
  const lastUpdate = properties?.getProperty("LAST_WORKOUT_UPDATE");

  // If we have a stored timestamp, return it
  if (lastUpdate) {
    return lastUpdate;
  }

  // Only check sheet if no stored timestamp (first run scenario)
  // Use getValue() on single cell - acceptable for one-time check
  if (sheet.getLastRow() > 1 && sheet.getRange("A2").getValue()) {
    return false; // Data exists but no timestamp stored
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

    // Handle post-processing with timeout checks
    // Note: syncLocalizedExerciseNames is already called in importAllWorkoutsFull/Delta
    // with the idToLocalizedName map for optimization
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
 * Performs a full import of all workouts.
 * Clears existing data rows (keeping headers), fetches all pages,
 * and writes rows in a single batch.
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<number>} Number of workout records imported
 */
async function importAllWorkoutsFull(checkTimeout = null) {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const props = getDocumentProperties();
  props?.deleteProperty("LAST_WORKOUT_UPDATE");

  manager.clearSheet();

  const allWorkouts = [];
  await apiClient.fetchPaginatedData(
    API_ENDPOINTS.WORKOUTS,
    PAGE_SIZE.WORKOUTS,
    (workouts) => {
      if (workouts) allWorkouts.push(...workouts);
    },
    "workouts",
    {},
    checkTimeout
  );

  const rows = processWorkoutsData(allWorkouts);
  if (rows.length) {
    manager.sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  // Build idToLocalizedName map from in-memory workout data (OPTIMIZATION)
  const idToLocalizedName = new Map();
  allWorkouts.forEach((workout) => {
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach((exercise) => {
        const exerciseTemplateId = exercise.exercise_template_id;
        const localizedTitle = exercise.title;
        if (
          exerciseTemplateId &&
          localizedTitle &&
          exerciseTemplateId !== "N/A"
        ) {
          // Use the most recent localized name for each ID
          idToLocalizedName.set(exerciseTemplateId, localizedTitle);
        }
      });
    }
  });

  props?.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
  const ss = getActiveSpreadsheet();
  ss.toast(
    `Imported ${rows.length} workout records.`,
    "Full Import Complete",
    TOAST_DURATION.NORMAL
  );

  // Store the map in a global variable or pass it through the call chain
  // For now, we'll pass it via document properties as a workaround
  // In a better design, we'd return it and pass it to syncLocalizedExerciseNames
  // But to minimize changes, we'll call syncLocalizedExerciseNames with the map
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

  return rows.length;
}

/**
 * Gets API key from document properties
 * @returns {string} API key
 * @throws {ConfigurationError} If properties or API key not found
 * @private
 */
function getApiKeyForWorkouts() {
  const properties = getDocumentProperties();
  if (!properties) {
    throw new ConfigurationError(
      "Unable to access document properties. Please ensure you have proper permissions."
    );
  }

  const apiKey = properties.getProperty("HEVY_API_KEY");
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }

  return apiKey;
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
 * Fetches a single workout with retry logic
 * @param {string} workoutId - Workout ID to fetch
 * @param {string} apiKey - API key for authentication
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<Object>} Workout data
 * @throws {Error} If request fails after retries
 * @private
 */
async function _fetchWorkoutWithRetry(workoutId, apiKey, checkTimeout = null) {
  // Check timeout before making request
  if (checkTimeout && checkTimeout()) {
    throw new ImportTimeoutError(
      `Timeout approaching while fetching workout ${workoutId}`
    );
  }

  // apiClient.makeRequest already has retry logic (3 attempts with exponential backoff)
  // This function provides an additional layer for handling specific retry scenarios
  try {
    const resp = await apiClient.makeRequest(
      `${API_ENDPOINTS.WORKOUTS}/${workoutId}`,
      apiClient.createRequestOptions(apiKey)
    );
    return resp.workout || resp;
  } catch (error) {
    // If it's a retryable error and we haven't exceeded retry attempts, retry
    if (
      error instanceof ApiError &&
      error.isRetryable() &&
      WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS > 0
    ) {
      // Additional retries beyond what apiClient.makeRequest already did
      for (
        let attempt = 0;
        attempt < WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS;
        attempt++
      ) {
        if (checkTimeout && checkTimeout()) {
          throw new ImportTimeoutError(
            `Timeout approaching while retrying workout ${workoutId}`
          );
        }

        // Exponential backoff with jitter
        const delay =
          Math.min(
            API_CLIENT_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
            API_CLIENT_CONFIG.MAX_DELAY_MS
          ) *
          (0.5 + Math.random() * 0.5);
        Utilities.sleep(delay);

        try {
          const resp = await apiClient.makeRequest(
            `${API_ENDPOINTS.WORKOUTS}/${workoutId}`,
            apiClient.createRequestOptions(apiKey)
          );
          return resp.workout || resp;
        } catch (retryError) {
          // If this is the last attempt, throw the error
          if (attempt === WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS - 1) {
            throw retryError;
          }
          // Otherwise continue to next retry
        }
      }
    }
    throw error;
  }
}

/**
 * Fetches workouts in batches with retry logic and validation
 * @param {Array<string>} workoutIds - Array of workout IDs to fetch
 * @param {string} apiKey - API key for authentication
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<Object>} Object with fullWorkouts array and failedIds array
 * @throws {ValidationError} If failure threshold exceeded or minimum success not met
 * @private
 */
async function _fetchWorkoutsInBatches(
  workoutIds,
  apiKey,
  checkTimeout = null
) {
  const fullWorkouts = [];
  const failedIds = [];
  const batchSize = WORKOUT_IMPORT_CONFIG.BATCH_SIZE;
  const totalCount = workoutIds.length;

  // Process in batches
  for (let i = 0; i < workoutIds.length; i += batchSize) {
    if (checkTimeout && checkTimeout()) {
      throw new ImportTimeoutError(
        `Timeout approaching while fetching workout batch (${i}/${totalCount})`
      );
    }

    const batch = workoutIds.slice(
      i,
      Math.min(i + batchSize, workoutIds.length)
    );
    const batchResults = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          return await _fetchWorkoutWithRetry(id, apiKey, checkTimeout);
        } catch (error) {
          // Wrap error to preserve workout ID in rejection
          const wrappedError = new Error(`Failed to fetch workout ${id}`);
          wrappedError.originalError = error;
          wrappedError.workoutId = id;
          throw wrappedError;
        }
      })
    );

    // Process batch results
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const workoutId = batch[j];

      if (result.status === "fulfilled") {
        fullWorkouts.push(result.value);
      } else {
        failedIds.push(workoutId);
        const error = result.reason?.originalError || result.reason;
        console.error(`Failed to fetch workout ${workoutId}:`, error);
      }
    }

    // Rate limiting between batches
    if (i + batchSize < workoutIds.length) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }

  // Validate results
  const successCount = fullWorkouts.length;
  const failureCount = failedIds.length;
  const failureRate = totalCount > 0 ? failureCount / totalCount : 0;

  // Check minimum success count
  if (successCount < WORKOUT_IMPORT_CONFIG.MIN_SUCCESS_COUNT) {
    const errorMessage = `Workout import failed: Only ${successCount} of ${totalCount} requests succeeded (minimum ${WORKOUT_IMPORT_CONFIG.MIN_SUCCESS_COUNT} required).`;
    const failedIdsDisplay =
      failedIds.length <= 10
        ? failedIds.join(", ")
        : `${failedIds.slice(0, 10).join(", ")} and ${
            failedIds.length - 10
          } more`;

    throw new ValidationError(errorMessage, {
      totalCount,
      successCount,
      failureCount,
      failureRate,
      failedIds: failedIds.slice(0, 50), // Store up to 50 failed IDs for context
      failedIdsDisplay,
      recoverySuggestion:
        "Check your API connection and try again. If the issue persists, verify your API key is valid.",
    });
  }

  // Check failure threshold
  if (
    failureCount > 1 &&
    failureRate > WORKOUT_IMPORT_CONFIG.FAILURE_THRESHOLD
  ) {
    const errorMessage = `Workout import aborted: ${(failureRate * 100).toFixed(
      1
    )}% of requests failed (threshold: ${(
      WORKOUT_IMPORT_CONFIG.FAILURE_THRESHOLD * 100
    ).toFixed(1)}%).`;
    const failedIdsDisplay =
      failedIds.length <= 10
        ? failedIds.join(", ")
        : `${failedIds.slice(0, 10).join(", ")} and ${
            failedIds.length - 10
          } more`;

    throw new ValidationError(errorMessage, {
      totalCount,
      successCount,
      failureCount,
      failureRate,
      failedIds: failedIds.slice(0, 50), // Store up to 50 failed IDs for context
      failedIdsDisplay,
      recoverySuggestion:
        "Too many requests failed. Check your API connection and try again. If the issue persists, verify your API key is valid.",
    });
  }

  // Log warning if there were some failures but we're continuing
  if (failureCount > 0) {
    const failedIdsDisplay =
      failedIds.length <= 10
        ? failedIds.join(", ")
        : `${failedIds.slice(0, 10).join(", ")} and ${
            failedIds.length - 10
          } more`;
    console.warn(
      `Workout import completed with ${failureCount} failure(s) out of ${totalCount} requests (${(
        failureRate * 100
      ).toFixed(1)}% failure rate). Failed IDs: ${failedIdsDisplay}`
    );
  }

  return { fullWorkouts, failedIds };
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
    await apiClient.fetchPaginatedData(
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

    const apiKey = getApiKeyForWorkouts();
    const { fullWorkouts, failedIds } = await _fetchWorkoutsInBatches(
      upsertIds,
      apiKey,
      checkTimeout
    );

    const rows = processWorkoutsData(fullWorkouts);
    updateWorkoutData(manager.sheet, rows);
    props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());

    // Build idToLocalizedName map from in-memory workout data (OPTIMIZATION)
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
            // Use the most recent localized name for each ID
            idToLocalizedName.set(exerciseTemplateId, localizedTitle);
          }
        });
      }
    });

    const ss = getActiveSpreadsheet();
    // Update toast message to include failure information if applicable
    let toastMessage = `Imported ${rows.length} workout records.`;
    if (failedIds.length > 0) {
      toastMessage += ` ${failedIds.length} workout(s) failed to import.`;
    }
    ss.toast(toastMessage, "Delta Import Complete", TOAST_DURATION.NORMAL);

    // Call syncLocalizedExerciseNames with the map to avoid reading from sheet
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

/**
 * Deletes workout rows from the sheet in a single bulk rewrite.
 * Optimized to check last row before reading entire range.
 * @private
 */
function deleteWorkoutRows(sheet, workoutIds) {
  // Early return if sheet is empty
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return; // Nothing to delete (only headers or empty)
  }

  // Read entire data range in one batch operation
  const values = sheet.getDataRange().getValues();

  // Validate that we have data
  if (!values || values.length === 0) {
    return; // Nothing to delete
  }

  const headers = values[0];
  const idIdx = headers.indexOf("ID");

  // Validate that ID column exists
  if (idIdx === -1) {
    throw new SheetError("ID column not found in sheet", sheet.getName(), {
      headers: headers,
    });
  }

  const filtered = values.filter(
    (row, i) => i === 0 || !workoutIds.has(row[idIdx])
  );

  sheet.clearContents();

  // Validate that filtered array is not empty before accessing filtered[0]
  if (filtered.length === 0) {
    // Sheet is now empty, nothing to write
    return;
  }

  // Safely get column count - use headers.length as fallback
  const numCols = filtered[0]?.length || headers.length;
  sheet.getRange(1, 1, filtered.length, numCols).setValues(filtered);
}

/**
 * Updates workout data in the sheet using contiguous block writes.
 * Optimized to read range only once and batch all updates.
 * @private
 */
function updateWorkoutData(sheet, processedData) {
  // Early return if no data to process
  if (!processedData || processedData.length === 0) {
    return;
  }

  // Read entire data range in one batch operation (most efficient)
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const idIdx = headers.indexOf("ID");
  const rowMap = new Map(values.map((r, i) => [r[idIdx], i + 2]));

  const updates = [];
  const additions = [];

  processedData.forEach((row) => {
    const id = row[0];
    if (rowMap.has(id)) updates.push({ r: rowMap.get(id), d: row });
    else additions.push(row);
  });

  updates
    .sort((a, b) => a.r - b.r)
    .reduce((segs, u) => {
      const last = segs[segs.length - 1];
      if (last && u.r === last.start + last.data.length) last.data.push(u.d);
      else segs.push({ start: u.r, data: [u.d] });
      return segs;
    }, [])
    .forEach((seg) => {
      sheet
        .getRange(seg.start, 1, seg.data.length, seg.data[0].length)
        .setValues(seg.data);
    });

  if (additions.length) {
    sheet.insertRowsBefore(2, additions.length);
    sheet
      .getRange(2, 1, additions.length, additions[0].length)
      .setValues(additions);
  }
}

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
