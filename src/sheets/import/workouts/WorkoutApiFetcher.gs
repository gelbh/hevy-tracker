/**
 * API fetching utilities for workout imports with retry logic and batch processing.
 * @module workouts/WorkoutApiFetcher
 */

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
  if (checkTimeout && checkTimeout()) {
    throw new ImportTimeoutError(
      `Timeout approaching while fetching workout ${workoutId}`
    );
  }

  const client = getApiClient();
  try {
    const resp = await client.makeRequest(
      `${API_ENDPOINTS.WORKOUTS}/${workoutId}`,
      client.createRequestOptions(apiKey)
    );
    return resp.workout || resp;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.isRetryable() &&
      WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS > 0
    ) {
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

        const delay =
          Math.min(
            API_CLIENT_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
            API_CLIENT_CONFIG.MAX_DELAY_MS
          ) *
          (0.5 + Math.random() * 0.5);
        Utilities.sleep(delay);

        try {
          const resp = await client.makeRequest(
            `${API_ENDPOINTS.WORKOUTS}/${workoutId}`,
            client.createRequestOptions(apiKey)
          );
          return resp.workout || resp;
        } catch (retryError) {
          if (attempt === WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS - 1) {
            throw retryError;
          }
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
          const wrappedError = new Error(`Failed to fetch workout ${id}`);
          wrappedError.originalError = error;
          wrappedError.workoutId = id;
          throw wrappedError;
        }
      })
    );

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

    if (i + batchSize < workoutIds.length) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }

  const successCount = fullWorkouts.length;
  const failureCount = failedIds.length;
  const failureRate = totalCount > 0 ? failureCount / totalCount : 0;

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
      failedIds: failedIds.slice(0, 50),
      failedIdsDisplay,
      recoverySuggestion:
        "Check your API connection and try again. If the issue persists, verify your API key is valid.",
    });
  }

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
      failedIds: failedIds.slice(0, 50),
      failedIdsDisplay,
      recoverySuggestion:
        "Too many requests failed. Check your API connection and try again. If the issue persists, verify your API key is valid.",
    });
  }

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
