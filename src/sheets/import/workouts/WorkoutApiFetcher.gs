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
 * Builds request objects for parallel workout fetching
 * @param {Array<string>} workoutIds - Array of workout IDs
 * @param {string} apiKey - API key
 * @returns {Array<Object>} Array of request objects
 * @private
 */
function _buildWorkoutRequests(workoutIds, apiKey) {
  const client = getApiClient();
  return workoutIds.map((workoutId) => {
    const url = client.buildUrl(`${API_ENDPOINTS.WORKOUTS}/${workoutId}`, {});
    const requestOptions = client.createRequestOptions(apiKey);
    return {
      url: url,
      ...requestOptions,
    };
  });
}

/**
 * Processes a successful workout response
 * @param {GoogleAppsScript.URL_Fetch.HTTPResponse} response - HTTP response
 * @param {string} workoutId - Workout ID
 * @returns {Object|null} Parsed workout object or null on error
 * @private
 */
function _parseWorkoutResponse(response, workoutId) {
  try {
    const responseText = response.getContentText();
    const parsedResponse = JSON.parse(responseText);
    return parsedResponse.workout || parsedResponse;
  } catch (error) {
    console.error(`Failed to parse workout ${workoutId}:`, error);
    return null;
  }
}

/**
 * Retries fetching a workout with exponential backoff
 * @param {string} workoutId - Workout ID to fetch
 * @param {string} apiKey - API key
 * @param {Function} checkTimeout - Timeout check function
 * @returns {Promise<Object|null>} Workout object or null if failed
 * @private
 */
async function _retryWorkoutFetch(workoutId, apiKey, checkTimeout) {
  const client = getApiClient();
  const maxAttempts = WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (checkTimeout && checkTimeout()) {
      return null;
    }

    const delay =
      Math.min(
        API_CLIENT_CONFIG.BASE_DELAY_MS * Math.pow(2, attempt),
        API_CLIENT_CONFIG.MAX_DELAY_MS
      ) *
      (0.5 + Math.random() * 0.5);
    Utilities.sleep(delay);

    try {
      const retryResponse = await client.makeRequest(
        `${API_ENDPOINTS.WORKOUTS}/${workoutId}`,
        client.createRequestOptions(apiKey)
      );
      return retryResponse.workout || retryResponse;
    } catch (retryError) {
      if (attempt === maxAttempts - 1) {
        console.error(
          `Failed to fetch workout ${workoutId} after retries:`,
          retryError
        );
      }
    }
  }
  return null;
}

/**
 * Applies adaptive rate limiting delay between batches
 * @param {Object} client - API client instance
 * @param {boolean} hasMoreBatches - Whether more batches remain
 * @private
 */
function _applyBatchRateLimit(client, hasMoreBatches) {
  if (!hasMoreBatches) {
    return;
  }

  const rateLimitInfo = client.rateLimitManager.getRateLimitInfo();
  if (
    rateLimitInfo &&
    rateLimitInfo.remaining !== null &&
    rateLimitInfo.limit !== null
  ) {
    const remainingPercent = rateLimitInfo.remaining / rateLimitInfo.limit;
    const LOW_THRESHOLD_PERCENT = 0.2;
    const LOW_THRESHOLD_COUNT = 50;

    if (
      remainingPercent < LOW_THRESHOLD_PERCENT ||
      rateLimitInfo.remaining < LOW_THRESHOLD_COUNT
    ) {
      Utilities.sleep(100);
    }
  } else {
    Utilities.sleep(RATE_LIMIT.API_DELAY);
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
  const client = getApiClient();

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

    const requests = _buildWorkoutRequests(batch, apiKey);
    const responses = UrlFetchApp.fetchAll(requests);

    for (let j = 0; j < responses.length; j++) {
      const response = responses[j];
      const workoutId = batch[j];
      const statusCode = response.getResponseCode();

      QuotaTracker.recordUrlFetch(1);

      const headers = response.getHeaders();
      client.rateLimitManager.updateRateLimitInfo(headers);

      if (
        statusCode >= HTTP_STATUS_RANGE.SUCCESS_START &&
        statusCode <= HTTP_STATUS_RANGE.SUCCESS_END
      ) {
        const workout = _parseWorkoutResponse(response, workoutId);
        if (workout) {
          fullWorkouts.push(workout);
        } else {
          failedIds.push(workoutId);
        }
      } else if (
        statusCode >= HTTP_STATUS_RANGE.SERVER_ERROR_START &&
        statusCode <= HTTP_STATUS_RANGE.SERVER_ERROR_END &&
        WORKOUT_IMPORT_CONFIG.RETRY_ATTEMPTS > 0
      ) {
        const workout = await _retryWorkoutFetch(
          workoutId,
          apiKey,
          checkTimeout
        );
        if (workout) {
          fullWorkouts.push(workout);
        } else {
          failedIds.push(workoutId);
        }
      } else {
        failedIds.push(workoutId);
        const errorText = response.getContentText();
        console.error(
          `Failed to fetch workout ${workoutId} (status ${statusCode}):`,
          errorText
        );
      }
    }

    _applyBatchRateLimit(client, i + batchSize < workoutIds.length);
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
