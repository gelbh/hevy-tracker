/**
 * @typedef {Object} ExerciseTemplate
 * @property {string} id - Exercise template ID
 * @property {string} title - Exercise name
 * @property {string} type - Exercise type (e.g., "weight_reps")
 * @property {string} primary_muscle_group - Primary muscle group
 * @property {Array<string>} secondary_muscle_groups - Secondary muscle groups
 * @property {boolean} is_custom - Whether this is a custom exercise
 */

/**
 * Functions for importing exercise data from Hevy API.
 * @module Exercises
 */

/**
 * Imports all exercises from Hevy API and populates the 'Exercises' sheet.
 * Only adds new exercises while preserving existing ones.
 * New exercises are added at the end of the sheet and all exercises are sorted by count.
 * Exercise counts are always recalculated even if no new exercises are imported.
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 */
async function importAllExercises(checkTimeout = null) {
  try {
    const manager = SheetManager.getOrCreate(EXERCISES_SHEET_NAME);
    const sheet = manager.sheet;

    const existingData = getExistingExercises(sheet);
    const allApiExercises = [];
    const processedExercises = [];

    const processExercisePage = async (exercises) => {
      allApiExercises.push(...exercises);

      const newExercises = exercises.filter(
        (exercise) => !shouldSkipExercise(exercise, existingData)
      );

      if (newExercises.length > 0) {
        const processedData = processExercisesData(newExercises);
        processedExercises.push(...processedData);
      }
    };

    await getApiClient().fetchPaginatedData(
      API_ENDPOINTS.EXERCISES,
      PAGE_SIZE.EXERCISES,
      processExercisePage,
      "exercise_templates",
      {},
      checkTimeout
    );

    const ss = getActiveSpreadsheet();
    if (ss.getId() !== TEMPLATE_SPREADSHEET_ID) {
      syncCustomExerciseIds(sheet, allApiExercises);
    }

    if (processedExercises.length > 0) {
      await insertNewExercises(sheet, processedExercises);
    }

    const updateMessage =
      processedExercises.length > 0
        ? `Imported ${processedExercises.length} new exercises. `
        : "No new exercises found. ";

    await handlePostProcessing(sheet, checkTimeout, updateMessage);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing exercises",
      sheetName: EXERCISES_SHEET_NAME,
    });
  }
}

/**
 * Handles post-processing operations with timeout error handling
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The exercise sheet
 * @param {Function} checkTimeout - Timeout checker function
 * @param {string} updateMessage - Message to display
 * @private
 */
async function handlePostProcessing(sheet, checkTimeout, updateMessage) {
  try {
    await updateExerciseCounts(sheet, checkTimeout);
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("updateExerciseCounts timed out during exercise import");
    } else {
      throw error;
    }
  }

  try {
    await SheetManager.getOrCreate(EXERCISES_SHEET_NAME).formatSheet(
      checkTimeout
    );
  } catch (error) {
    if (error instanceof ImportTimeoutError) {
      console.warn("formatSheet timed out during exercise import");
    } else {
      throw error;
    }
  }

  getActiveSpreadsheet().toast(
    `${updateMessage}Updated counts for all exercises!`,
    "Import Complete",
    TOAST_DURATION.NORMAL
  );
}

/**
 * Syncs IDs for any custom exercises in the sheet.
 * For each row where "Is Custom" is TRUE:
 *  • if an API exercise with the same title exists, set the ID to its API ID
 *  • otherwise set the ID to "N/A"
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The Exercises sheet
 * @param {{id:string,title:string}[]} apiExercises Array of all exercises from the API
 */
function syncCustomExerciseIds(sheet, apiExercises) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  validateExerciseSheetHeaders(headers, ["ID", "Title"]);

  const idCol = headers.indexOf("ID") + 1;
  const titleCol = headers.indexOf("Title") + 1;

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1 || lastColumn === 0) return;

  const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  const newIds = data.map((row) => {
    const match = apiExercises.find(
      (ex) => ex.title.toLowerCase() === String(row[titleCol - 1]).toLowerCase()
    );
    return [match ? match.id : "N/A"];
  });

  sheet.getRange(2, idCol, newIds.length, 1).setValues(newIds);
}

/**
 * Gets existing exercises from the sheet along with their details
 * @private
 */
function getExistingExercises(sheet) {
  try {
    const existingDataById = new Map();
    const existingDataByTitle = new Map();

    if (sheet.getLastRow() <= 1) {
      return {
        byId: existingDataById,
        byTitle: existingDataByTitle,
      };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const indices = {
      id: headers.indexOf("ID"),
      title: headers.indexOf("Title"),
      rank: headers.indexOf("Rank"),
    };

    data.forEach((row) => {
      const id = String(row[indices.id] || "").trim();
      const title = String(row[indices.title] || "").trim();
      const hasRank = row[indices.rank] !== "";

      const exerciseData = { id, title, hasRank };

      if (id && id !== "N/A") {
        existingDataById.set(id, exerciseData);
      }
      if (title) {
        existingDataByTitle.set(title.toLowerCase(), exerciseData);
      }
    });

    return {
      byId: existingDataById,
      byTitle: existingDataByTitle,
    };
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting existing exercises",
      sheetName: sheet.getName(),
    });
  }
}

/**
 * Processes exercise data into a format suitable for the sheet
 * @param {Object[]} exercises - Array of exercise objects from API
 * @return {Array[]} Processed data ready for sheet insertion
 */
function processExercisesData(exercises) {
  try {
    const isTemplate =
      getActiveSpreadsheet().getId() === TEMPLATE_SPREADSHEET_ID;
    return exercises.map((exercise) => [
      isTemplate ? "" : exercise.id,
      exercise.title,
      "", // IMG
      exercise.type || "",
      toTitleCaseFromSnake(exercise.primary_muscle_group),
      arrayToTitleCase(exercise.secondary_muscle_groups),
      exercise.is_custom ? "TRUE" : "FALSE",
      0, // Count
      "", // Rank
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing exercise data",
      exerciseCount: exercises.length,
    });
  }
}

/**
 * Determines if an exercise should be skipped based on existing data.
 * Checks by ID first, then by title (with English translation fallback).
 * @param {Object} exercise - Exercise object from API
 * @param {Object} existingData - Object with byId and byTitle Maps
 * @return {boolean} True if exercise should be skipped
 */
function shouldSkipExercise(exercise, existingData) {
  if (exercise.id && existingData.byId.has(exercise.id)) {
    return true;
  }

  const titleKey = exercise.title.toLowerCase();
  if (existingData.byTitle.has(titleKey)) {
    return true;
  }

  const englishTitle = getEnglishName(exercise.title);
  if (englishTitle !== exercise.title) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (existingData.byTitle.has(englishTitleKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Appends new exercises at the end of the sheet.
 * @private
 */
async function insertNewExercises(sheet, processedExercises) {
  try {
    const startRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(
      startRow,
      1,
      processedExercises.length,
      processedExercises[0].length
    );
    range.setValues(processedExercises);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Appending new exercises",
      sheetName: sheet.getName(),
      exerciseCount: processedExercises.length,
    });
  }
}

/**
 * Validates that required headers exist in the exercise sheet
 * @param {Array<string>} headers - Array of header strings from the sheet
 * @param {Array<string>} requiredHeaders - Array of required header names
 * @throws {ConfigurationError} If any required headers are missing
 * @private
 */
function validateExerciseSheetHeaders(headers, requiredHeaders) {
  const missingHeaders = requiredHeaders.filter(
    (header) => headers.indexOf(header) === -1
  );

  if (missingHeaders.length > 0) {
    const expectedHeaders = SHEET_HEADERS[EXERCISES_SHEET_NAME].join(", ");
    const templateUrl = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SPREADSHEET_ID}`;
    throw new ConfigurationError(
      `Missing required column headers in Exercises sheet: ${missingHeaders.join(
        ", "
      )}. ` +
        `Expected headers: ${expectedHeaders}. ` +
        `\n\nYour spreadsheet appears to be an outdated version. Missing columns indicate that your spreadsheet structure doesn't match the current template. ` +
        `\n\nTo fix this, please make a new copy of the template spreadsheet: ` +
        `${templateUrl} ` +
        `\n\nAfter copying the template, you can re-import your data using the add-on's import functions.`,
      {
        missingHeaders: missingHeaders,
        expectedHeaders: SHEET_HEADERS[EXERCISES_SHEET_NAME],
        sheetName: EXERCISES_SHEET_NAME,
        templateSpreadsheetId: TEMPLATE_SPREADSHEET_ID,
        templateUrl: templateUrl,
      }
    );
  }
}
