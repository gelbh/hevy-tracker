/**
 * Sheet operations for routine builder.
 * Handles reading from and writing to the Routine Builder sheet.
 * @module actions/RoutineBuilderSheetOps
 */

/**
 * Error message for missing Routine Builder sheet
 * @type {string}
 * @private
 */
const MISSING_SHEET_MESSAGE =
  "This spreadsheet is missing the required 'Routine Builder' sheet.\n\n" +
  "Please make a copy of the official Hevy Tracker template before using the add-on.\n\n" +
  "Copy it from:\nhttps://docs.google.com/spreadsheets/d/1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk/copy";

/**
 * Gets the Routine Builder sheet or shows error
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} The sheet or null if not found
 */
function getRoutineBuilderSheet() {
  const sheet = getActiveSpreadsheet().getSheetByName(
    ROUTINE_BUILDER_SHEET_NAME
  );
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      "Missing 'Routine Builder' Sheet",
      MISSING_SHEET_MESSAGE,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  return sheet;
}

/**
 * Gets folder name from folder ID
 * @param {number|null} folderId - Folder ID
 * @returns {string|null} Folder name or null if not found
 */
function getFolderNameFromId(folderId) {
  if (!folderId) return null;

  try {
    const ss = getActiveSpreadsheet();
    const foldersSheet = ss.getSheetByName(ROUTINE_FOLDERS_SHEET_NAME);
    if (!foldersSheet) return null;

    const folderData = foldersSheet.getDataRange().getValues();
    if (folderData.length < 2) return null;

    const headers = folderData[0];
    const idIndex = headers.indexOf("ID");
    const titleIndex = headers.indexOf("Name");

    if (idIndex === -1 || titleIndex === -1) return null;

    for (let i = 1; i < folderData.length; i++) {
      const row = folderData[i];
      if (row[idIndex] == folderId) {
        return String(row[titleIndex] ?? "").trim() || null;
      }
    }
    return null;
  } catch (error) {
    console.warn("Error getting folder name:", error);
    return null;
  }
}

/**
 * Gets folder name from folder ID with API fallback
 * First tries to get the folder name from the local sheet (fast path),
 * then falls back to API if not found locally
 * @param {number|null} folderId - Folder ID
 * @returns {Promise<string|null>} Folder name or null if not found
 */
async function getFolderNameFromIdWithApiFallback(folderId) {
  if (!folderId) return null;

  // First try local sheet (fast path)
  const localFolderName = getFolderNameFromId(folderId);
  if (localFolderName) {
    return localFolderName;
  }

  // If not found locally, try API
  try {
    const folderName = await findRoutineFolderById(folderId);
    return folderName;
  } catch (error) {
    console.warn("Error getting folder name from API:", error);
    return null;
  }
}

/**
 * Gets exercise name from template ID
 * @param {string} templateId - Exercise template ID
 * @returns {string|null} Exercise name or null if not found
 */
function getExerciseNameFromTemplateId(templateId) {
  if (!templateId) return null;

  try {
    const ss = getActiveSpreadsheet();
    const exercisesSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);
    if (!exercisesSheet) return null;

    const exerciseData = exercisesSheet.getDataRange().getValues();
    if (exerciseData.length < 2) return null;

    const headers = exerciseData[0];
    const idIndex = headers.indexOf("ID");
    const titleIndex = headers.indexOf("Title");

    if (idIndex === -1 || titleIndex === -1) return null;

    const templateIdUpper = String(templateId).trim().toUpperCase();
    for (let i = 1; i < exerciseData.length; i++) {
      const row = exerciseData[i];
      const rowId = String(row[idIndex] ?? "")
        .trim()
        .toUpperCase();
      if (rowId === templateIdUpper) {
        return String(row[titleIndex] ?? "").trim() || null;
      }
    }
    return null;
  } catch (error) {
    console.warn("Error getting exercise name:", error);
    return null;
  }
}

/**
 * Converts a routine exercise to sheet row format
 * @param {Object} exercise - Routine exercise object
 * @param {string} weightUnit - User's weight unit (kg, lbs, stone)
 * @returns {Array<Array>} Array of row arrays (one per set)
 */
function convertRoutineExerciseToSheetRows(exercise, weightUnit) {
  const rows = [];
  const templateId = exercise.exercise_template_id ?? "";
  const exerciseName =
    getExerciseNameFromTemplateId(templateId) ??
    exercise.title ??
    "Unknown Exercise";

  const displayName =
    exerciseName === "Unknown Exercise" && templateId
      ? templateId
      : exerciseName;

  const conversionFactors = {
    lbs: 1 / WEIGHT_CONVERSION.LBS_TO_KG,
    stone: 1 / WEIGHT_CONVERSION.STONE_TO_KG,
    kg: 1,
  };
  const conversionFactor = conversionFactors[weightUnit] ?? 1;

  const restSeconds = exercise.rest_seconds ?? "";
  const notes = exercise.notes?.trim() || "";
  const supersetId = exercise.superset_id ?? "";
  const displayTemplateId = templateId || "N/A";

  if (!exercise.sets?.length) {
    rows.push([
      displayName,
      restSeconds,
      "",
      "",
      "",
      notes,
      supersetId,
      displayTemplateId,
    ]);
    return rows;
  }

  exercise.sets.forEach((set, index) => {
    let weight = set.weight_kg;
    let reps = getRepsValue(set);
    const distance = set.distance_meters;
    const duration = set.duration_seconds;

    if (weight != null) {
      weight = weight * conversionFactor;
      const decimalPlaces = ROUTINE_BUILDER_CONFIG.DECIMAL_PLACES;
      weight =
        Math.round(weight * Math.pow(10, decimalPlaces)) /
        Math.pow(10, decimalPlaces);
    }

    if (distance != null) {
      reps = distance;
    }

    if (duration != null) {
      weight = duration;
    }

    const isFirstSet = index === 0;

    rows.push([
      isFirstSet ? displayName : "",
      isFirstSet ? restSeconds : "",
      set.type ?? "normal",
      weight ?? "",
      reps ?? "",
      isFirstSet ? notes : "",
      isFirstSet ? supersetId : "",
      isFirstSet ? displayTemplateId : "",
    ]);
  });

  return rows;
}

/**
 * Populates the Routine Builder sheet with routine data
 * @param {Object} routine - Routine object from API
 * @returns {Promise<void>}
 */
async function populateRoutineBuilderSheet(routine) {
  const sheet = getRoutineBuilderSheet();
  if (!sheet) {
    throw new SheetError(
      "Routine Builder sheet not found",
      ROUTINE_BUILDER_SHEET_NAME,
      {
        operation: "Populating routine builder",
      }
    );
  }

  try {
    sheet
      .getRange(`${ROUTINE_BUILDER_CELLS.TITLE}:${ROUTINE_BUILDER_CELLS.NOTES}`)
      .clearContent();
    sheet
      .getRange(`${ROUTINE_BUILDER_CELLS.EXERCISE_DATA_START}:H`)
      .clearContent();

    const routineTitle = routine.title ?? "";
    sheet.getRange(ROUTINE_BUILDER_CELLS.TITLE).setValue(routineTitle);

    let folderName = "(No Folder)";
    if (routine.folder_id) {
      const foundFolderName = await getFolderNameFromIdWithApiFallback(
        routine.folder_id
      );
      if (foundFolderName) {
        folderName = foundFolderName;
      }
    }
    sheet.getRange(ROUTINE_BUILDER_CELLS.FOLDER).setValue(folderName);

    const routineNotes = routine.notes ?? "";
    sheet.getRange(ROUTINE_BUILDER_CELLS.NOTES).setValue(routineNotes);

    const routineId = routine.id ?? "";
    sheet.getRange(ROUTINE_BUILDER_CELLS.ROUTINE_ID).setValue(routineId);

    const folderId = routine.folder_id ?? "";
    sheet.getRange(ROUTINE_BUILDER_CELLS.FOLDER_ID).setValue(folderId);

    const ss = getActiveSpreadsheet();
    const mainSheet = ss.getSheetByName(MAIN_SHEET_NAME);
    const weightUnit =
      mainSheet?.getRange(MAIN_SHEET_CELLS.WEIGHT_UNIT).getValue() ??
      ROUTINE_BUILDER_CONFIG.DEFAULT_WEIGHT_UNIT;

    const allRows = [];
    const missingExercises = [];

    if (routine.exercises?.length) {
      routine.exercises.forEach((exercise) => {
        const templateId = exercise.exercise_template_id ?? "";
        const exerciseName = getExerciseNameFromTemplateId(templateId);

        if (!templateId || templateId === "N/A") {
          missingExercises.push(exercise.title ?? "Unknown Exercise");
        } else if (!exerciseName) {
          missingExercises.push(exercise.title ?? templateId);
        }

        const rows = convertRoutineExerciseToSheetRows(exercise, weightUnit);
        allRows.push(...rows);
      });
    } else {
      ss.toast(
        `Routine "${routine.title}" loaded, but it has no exercises.`,
        "Info",
        TOAST_DURATION.NORMAL
      );
    }

    if (allRows.length > 0) {
      sheet
        .getRange(
          ROUTINE_BUILDER_CELLS.EXERCISE_DATA_START_ROW,
          ROUTINE_BUILDER_CELLS.EXERCISE_DATA_START_COL,
          allRows.length,
          ROUTINE_BUILDER_CELLS.EXERCISE_DATA_COLUMNS
        )
        .setValues(allRows);
    }

    if (missingExercises.length > 0) {
      ss.toast(
        `Warning: ${
          missingExercises.length
        } exercise(s) may need template IDs: ${missingExercises
          .slice(0, 3)
          .join(", ")}${missingExercises.length > 3 ? "..." : ""}`,
        "Warning",
        TOAST_DURATION.LONG
      );
    } else if (routine.exercises?.length) {
      ss.toast(
        `Routine "${routine.title}" loaded successfully!`,
        "Success",
        TOAST_DURATION.SHORT
      );
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Populating routine builder sheet",
      routineId: routine.id,
      routineTitle: routine.title,
    });
  }
}
