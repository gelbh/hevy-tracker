/**
 * Functions for syncing localized exercise names across sheets.
 * @module ExerciseLocalization
 */

/**
 * Syncs localized exercise names across all sheets.
 * First updates Exercises sheet with localized names from workouts (by ID).
 * Then scans all sheets and replaces hardcoded exercise names (non-formula) with localized names.
 * @param {Map<string, string>} [idToLocalizedName] - Optional map of exercise_template_id -> localized name.
 *   If provided, avoids reading workout data from sheet (performance optimization).
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function syncLocalizedExerciseNames(
  idToLocalizedName = null,
  checkTimeout = null
) {
  const ss = getActiveSpreadsheet();
  const workoutSheet = ss.getSheetByName(WORKOUTS_SHEET_NAME);
  const exerciseSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);

  if (!workoutSheet || workoutSheet.getLastRow() <= 1) return;
  if (!exerciseSheet || exerciseSheet.getLastRow() <= 1) return;

  try {
    const localizedMap =
      idToLocalizedName || buildLocalizedNameMapFromSheet(workoutSheet);

    if (localizedMap.size === 0) return;

    checkAndThrowTimeout(checkTimeout, "syncLocalizedExerciseNames");

    const { exerciseData, exerciseNameToLocalized, nameToExerciseId } =
      buildExerciseNameMaps(exerciseSheet, localizedMap);

    await updateExercisesSheetNames(exerciseSheet, exerciseData, localizedMap);

    await updateSheetRangesWithLocalizedNames(
      ss,
      exerciseNameToLocalized,
      nameToExerciseId,
      localizedMap,
      checkTimeout
    );

    ImportProgressTracker.markOperationComplete("syncLocalizedExerciseNames");
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      ImportProgressTracker.markDeferredOperation("syncLocalizedExerciseNames");
    }
    throw ErrorHandler.handle(error, {
      operation: "Syncing localized exercise names across all sheets",
    });
  }
}

/**
 * Builds localized name map from workout sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} workoutSheet - The workout sheet
 * @returns {Map} Map of exercise ID to localized name
 * @private
 */
function buildLocalizedNameMapFromSheet(workoutSheet) {
  const workoutData = workoutSheet.getDataRange().getValues();
  const workoutHeaders = workoutData.shift();
  const exerciseTemplateIdIndex = workoutHeaders.indexOf(
    "Exercise Template ID"
  );
  const exerciseTitleIndex = workoutHeaders.indexOf("Exercise");

  if (exerciseTemplateIdIndex === -1 || exerciseTitleIndex === -1) {
    return new Map();
  }

  const idToLocalizedName = new Map();

  workoutData.forEach((row) => {
    const exerciseTemplateId = String(
      row[exerciseTemplateIdIndex] || ""
    ).trim();
    const localizedTitle = String(row[exerciseTitleIndex] || "").trim();

    if (exerciseTemplateId && localizedTitle && exerciseTemplateId !== "N/A") {
      idToLocalizedName.set(exerciseTemplateId, localizedTitle);
    }
  });

  return idToLocalizedName;
}

/**
 * Builds exercise name maps for localization
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @returns {Object} Maps for name lookups
 * @private
 */
function buildExerciseNameMaps(exerciseSheet, idToLocalizedName) {
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseHeaders = exerciseData.shift();

  validateExerciseSheetHeaders(exerciseHeaders, ["ID", "Title"]);

  const idIndex = exerciseHeaders.indexOf("ID");
  const titleIndex = exerciseHeaders.indexOf("Title");

  const exerciseNameToLocalized = new Map();
  const exerciseUpdates = [];
  const nameToExerciseId = new Map();

  exerciseData.forEach((row, rowIndex) => {
    const exerciseId = String(row[idIndex] || "").trim();
    const currentTitle = String(row[titleIndex] || "").trim();

    if (
      exerciseId &&
      exerciseId !== "N/A" &&
      idToLocalizedName.has(exerciseId)
    ) {
      const localizedName = idToLocalizedName.get(exerciseId);

      if (currentTitle) {
        exerciseNameToLocalized.set(currentTitle.toLowerCase(), localizedName);
      }
      exerciseNameToLocalized.set(localizedName.toLowerCase(), localizedName);

      if (localizedName !== currentTitle) {
        exerciseUpdates.push({
          row: rowIndex + 2,
          value: localizedName,
        });
      }

      const currentTitleKey = currentTitle.toLowerCase();
      if (!nameToExerciseId.has(currentTitleKey)) {
        nameToExerciseId.set(currentTitleKey, exerciseId);
      }
      const localizedKey = localizedName.toLowerCase();
      if (!nameToExerciseId.has(localizedKey)) {
        nameToExerciseId.set(localizedKey, exerciseId);
      }

      const englishTitle = getEnglishName(currentTitle);
      if (englishTitle !== currentTitle) {
        const englishKey = englishTitle.toLowerCase();
        if (!nameToExerciseId.has(englishKey)) {
          nameToExerciseId.set(englishKey, exerciseId);
        }
      }
    } else if (currentTitle) {
      exerciseNameToLocalized.set(currentTitle.toLowerCase(), currentTitle);
      if (!nameToExerciseId.has(currentTitle.toLowerCase())) {
        nameToExerciseId.set(currentTitle.toLowerCase(), exerciseId || "");
      }
    }
  });

  return {
    exerciseData,
    exerciseNameToLocalized,
    nameToExerciseId,
    exerciseUpdates,
    titleIndex,
  };
}

/**
 * Updates Exercises sheet with localized names
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 * @param {Array} exerciseData - Exercise data
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @private
 */
async function updateExercisesSheetNames(
  exerciseSheet,
  exerciseData,
  idToLocalizedName
) {
  const { exerciseUpdates, titleIndex } = buildExerciseNameMaps(
    exerciseSheet,
    idToLocalizedName
  );

  if (!exerciseUpdates || exerciseUpdates.length === 0) return;

  if (titleIndex < 0) {
    throw new ConfigurationError(
      "Title column not found in Exercises sheet. Please restore the sheet from the template.",
      {
        sheetName: exerciseSheet.getName(),
        missingColumn: "Title",
      }
    );
  }

  exerciseUpdates.sort((a, b) => a.row - b.row);

  const batches = [];
  let currentBatch = null;

  for (const update of exerciseUpdates) {
    if (
      !currentBatch ||
      update.row !== currentBatch.endRow + 1 ||
      update.row - currentBatch.startRow >= BATCH_CONFIG.SHEET_UPDATE_BATCH_SIZE
    ) {
      if (currentBatch) {
        batches.push(currentBatch);
      }
      currentBatch = {
        startRow: update.row,
        endRow: update.row,
        values: [[update.value]],
      };
    } else {
      currentBatch.endRow = update.row;
      currentBatch.values.push([update.value]);
    }
  }

  if (currentBatch) {
    batches.push(currentBatch);
  }

  for (const batch of batches) {
    const range = exerciseSheet.getRange(
      batch.startRow,
      titleIndex + 1,
      batch.values.length,
      1
    );
    range.setValues(batch.values);
  }
}

/**
 * Updates exercise names in specific sheet ranges
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - The spreadsheet
 * @param {Map} exerciseNameToLocalized - Map of exercise name to localized name
 * @param {Map} nameToExerciseId - Map of name to exercise ID
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateSheetRangesWithLocalizedNames(
  ss,
  exerciseNameToLocalized,
  nameToExerciseId,
  idToLocalizedName,
  checkTimeout
) {
  const rangesToUpdate = [
    { sheetName: "Strength Standards", column: 1, startRow: 2 },
    { sheetName: ROUTINES_SHEET_NAME, column: 6, startRow: 2 },
    { sheetName: EXERCISES_SHEET_NAME, column: 2, startRow: 2 },
  ];

  for (const rangeConfig of rangesToUpdate) {
    checkAndThrowTimeout(
      checkTimeout,
      "syncLocalizedExerciseNames",
      rangeConfig.sheetName
    );

    const sheet = ss.getSheetByName(rangeConfig.sheetName);
    if (!sheet || sheet.getLastRow() < rangeConfig.startRow) {
      continue;
    }

    try {
      await updateSheetRange(
        sheet,
        rangeConfig,
        exerciseNameToLocalized,
        nameToExerciseId,
        idToLocalizedName,
        checkTimeout
      );
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        throw error;
      }
      console.warn(
        `Error updating ${rangeConfig.sheetName} column ${rangeConfig.column}:`,
        error
      );
    }
  }
}

/**
 * Updates a specific sheet range with localized names
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update
 * @param {Object} rangeConfig - Range configuration
 * @param {Map} exerciseNameToLocalized - Map of exercise name to localized name
 * @param {Map} nameToExerciseId - Map of name to exercise ID
 * @param {Map} idToLocalizedName - Map of ID to localized name
 * @param {Function} checkTimeout - Timeout checker
 * @private
 */
async function updateSheetRange(
  sheet,
  rangeConfig,
  exerciseNameToLocalized,
  nameToExerciseId,
  idToLocalizedName,
  checkTimeout
) {
  const exerciseCol = rangeConfig.column;
  const numRows = sheet.getLastRow();
  const batchSize = BATCH_CONFIG.SHEET_UPDATE_BATCH_SIZE;
  const timeoutCheckInterval = 200;

  for (
    let startRow = rangeConfig.startRow;
    startRow <= numRows;
    startRow += batchSize
  ) {
    checkAndThrowTimeout(
      checkTimeout,
      "syncLocalizedExerciseNames",
      rangeConfig.sheetName
    );

    const endRow = Math.min(startRow + batchSize - 1, numRows);
    const range = sheet.getRange(
      startRow,
      exerciseCol,
      endRow - startRow + 1,
      1
    );
    const values = range.getValues();
    const formulas = range.getFormulas();

    const updates = [];

    for (let r = 0; r < values.length; r++) {
      if (
        r > 0 &&
        r % timeoutCheckInterval === 0 &&
        checkTimeout &&
        checkTimeout()
      ) {
        checkAndThrowTimeout(
          checkTimeout,
          "syncLocalizedExerciseNames",
          rangeConfig.sheetName
        );
      }

      const cellValue = values[r][0];
      const cellFormula = formulas[r][0];

      if (cellFormula && cellFormula.trim() !== "") continue;
      if (!cellValue || String(cellValue).trim() === "") continue;

      const cellText = String(cellValue).trim();
      const cellKey = cellText.toLowerCase();
      let localizedName = null;

      if (exerciseNameToLocalized.has(cellKey)) {
        localizedName = exerciseNameToLocalized.get(cellKey);
      } else {
        const englishName = getEnglishName(cellText);
        if (englishName !== cellText) {
          const englishKey = englishName.toLowerCase();
          if (exerciseNameToLocalized.has(englishKey)) {
            localizedName = exerciseNameToLocalized.get(englishKey);
          }
        }

        if (!localizedName && nameToExerciseId.has(cellKey)) {
          const exerciseId = nameToExerciseId.get(cellKey);
          if (idToLocalizedName.has(exerciseId)) {
            localizedName = idToLocalizedName.get(exerciseId);
          }
        }
      }

      if (localizedName && localizedName !== cellText) {
        updates.push({
          row: startRow + r,
          value: localizedName,
        });
      }
    }

    if (updates.length > 0) {
      applyBatchedUpdates(sheet, updates, exerciseCol, batchSize);
    }

    if (startRow % (batchSize * 10) === 0) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
    }
  }
}

/**
 * Applies batched updates to a sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet
 * @param {Array} updates - Array of update objects
 * @param {number} exerciseCol - Column number
 * @param {number} batchSize - Batch size
 * @private
 */
function applyBatchedUpdates(sheet, updates, exerciseCol, batchSize) {
  updates.sort((a, b) => a.row - b.row);

  const updateBatches = [];
  let currentBatch = null;

  for (const update of updates) {
    if (
      !currentBatch ||
      update.row !== currentBatch.endRow + 1 ||
      update.row - currentBatch.startRow >= batchSize
    ) {
      if (currentBatch) {
        updateBatches.push(currentBatch);
      }
      currentBatch = {
        startRow: update.row,
        endRow: update.row,
        values: [[update.value]],
      };
    } else {
      currentBatch.endRow = update.row;
      currentBatch.values.push([update.value]);
    }
  }

  if (currentBatch) {
    updateBatches.push(currentBatch);
  }

  for (const updateBatch of updateBatches) {
    const updateRange = sheet.getRange(
      updateBatch.startRow,
      exerciseCol,
      updateBatch.values.length,
      1
    );
    updateRange.setValues(updateBatch.values);
  }
}
