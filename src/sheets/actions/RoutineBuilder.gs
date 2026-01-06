/**
 * @typedef {Object} RoutineSet
 * @property {string} type - Set type (e.g., "normal")
 * @property {number|null} weight_kg - Weight in kilograms
 * @property {number|null} reps - Number of reps
 * @property {number|null} distance_meters - Distance in meters (for cardio)
 * @property {number|null} duration_seconds - Duration in seconds (for time-based exercises)
 * @property {Object|null} rep_range - Rep range with start and end
 * @property {number} rep_range.start - Starting rep count
 * @property {number} rep_range.end - Ending rep count
 */

/**
 * @typedef {Object} RoutineExercise
 * @property {string} exercise_template_id - The ID of the exercise template
 * @property {number|null} superset_id - ID if this exercise is part of a superset
 * @property {number} rest_seconds - Rest period in seconds between sets
 * @property {string} notes - Notes for this exercise
 * @property {Array<RoutineSet>} sets - Array of sets for this exercise
 */

/**
 * @typedef {Object} RoutineData
 * @property {Object} routine - Routine object
 * @property {string} routine.title - Routine title
 * @property {number|null} routine.folder_id - Folder ID for organization
 * @property {string|null} routine.notes - Routine notes
 * @property {Array<RoutineExercise>} routine.exercises - Array of exercises in the routine
 */

/**
 * Handles routine creation and submission to Hevy API
 * @module RoutineBuilder
 */

/**
 * Normalizes a string for case-insensitive comparison
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 * @private
 */
function normalizeString(str) {
  return String(str || "")
    .trim()
    .toLowerCase();
}

/**
 * Finds an existing routine with the same title and folder_id
 * @param {string} title - Routine title to search for
 * @param {number|null} folderId - Folder ID to match (null for no folder)
 * @returns {Promise<Object|null>} Matching routine object or null if not found
 */
async function findDuplicateRoutine(title, folderId) {
  try {
    const routines = await getRoutinesList();
    const normalizedTitle = normalizeString(title);

    return (
      routines.find((routine) => {
        const routineTitle = normalizeString(routine.title);
        const routineFolderId = routine.folder_id || null;
        return routineTitle === normalizedTitle && routineFolderId === folderId;
      }) || null
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding duplicate routine",
      routineTitle: title,
      folderId: folderId,
    });
  }
}

/**
 * Prompts user to confirm updating an existing loaded routine
 * @param {string} loadedRoutineId - ID of the loaded routine
 * @returns {Promise<boolean|null>} True to update, false to create new, null to cancel
 * @private
 */
function promptUpdateExistingRoutine(loadedRoutineId) {
  if (!loadedRoutineId) return false;

  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    "Update Existing Routine?",
    `This routine was loaded from your Hevy account.\n\n` +
      `Would you like to:\n` +
      `• Update the existing routine (Yes)\n` +
      `• Create a new routine (No)\n` +
      `• Cancel (Cancel)`,
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (response === ui.Button.CANCEL) return null;
  return response === ui.Button.YES;
}

/**
 * Prompts user to handle duplicate routine conflict
 * @param {Object} duplicateRoutine - Duplicate routine object
 * @param {string} title - Routine title
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Routine builder sheet
 * @returns {Promise<{shouldUpdate: boolean, routineId: string|null}|null>} Update decision or null to cancel
 * @private
 */
function promptDuplicateRoutine(duplicateRoutine, title, sheet) {
  const ui = SpreadsheetApp.getUi();
  const folderName = duplicateRoutine.folder_name || "(No Folder)";
  const response = ui.alert(
    "Routine Already Exists",
    `A routine with the name "${title}" already exists in the folder "${folderName}".\n\n` +
      `Would you like to:\n` +
      `• Replace the existing routine (Yes)\n` +
      `• Create a new routine anyway (No)\n` +
      `• Cancel (Cancel)`,
    ui.ButtonSet.YES_NO_CANCEL
  );

  if (response === ui.Button.CANCEL) return null;

  if (response === ui.Button.YES) {
    sheet.getRange("H1").setValue(duplicateRoutine.id);
    return { shouldUpdate: true, routineId: duplicateRoutine.id };
  }

  return { shouldUpdate: false, routineId: null };
}

/**
 * Validates exercise data from sheet
 * @param {Array<Array>} exerciseData - Exercise data rows from sheet
 * @returns {boolean} True if validation passes, false otherwise
 * @private
 */
function validateExerciseData(exerciseData) {
  if (exerciseData.length === 0) {
    SpreadsheetApp.getUi().alert(
      "At least one exercise with a set type is required",
      "Please add at least one exercise with a set type in the table.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return false;
  }

  const missingExercises = exerciseData.filter((row) => {
    const id = String(row[7]).trim().toUpperCase();
    return !id || id === "N/A";
  });

  if (missingExercises.length > 0) {
    const names = missingExercises.map((r) => r[0]).join(", ");
    SpreadsheetApp.getUi().alert(
      "Missing Exercise IDs",
      `The following exercises are not in your Hevy account: ${names}.\n` +
        "Please add them as custom exercises on Hevy, re-run 'Import Exercises' to sync IDs, and try again.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return false;
  }

  return true;
}

/**
 * Creates a routine from the sheet data and submits it to Hevy API
 * Reads exercise data from the Routine Builder sheet, validates it,
 * and creates a new routine in the user's Hevy account.
 *
 * @returns {Promise<Object|null>} Created routine data with id, title, and exercises, or null if error/validation fails
 * @throws {ValidationError} If routine data is invalid
 * @throws {ApiError} If API request fails
 * @throws {SheetError} If sheet operations fail
 */
async function createRoutineFromSheet() {
  const sheet = getRoutineBuilderSheet();
  if (!sheet) return null;

  const title = String(sheet.getRange("D2").getValue()).trim();
  if (!title) {
    SpreadsheetApp.getUi().alert(
      "Routine title is required",
      "Please enter a name for your routine in cell D2 before saving.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  try {
    let loadedRoutineId = sheet.getRange("H1").getValue();
    let shouldUpdate = false;

    if (loadedRoutineId) {
      const updateDecision = promptUpdateExistingRoutine(loadedRoutineId);
      if (updateDecision === null) return null;
      shouldUpdate = updateDecision;
    }

    const folderValue = sheet.getRange("D3").getValue();
    const notes = sheet.getRange("D4").getValue();

    const folderId = folderValue?.trim()
      ? await getOrCreateRoutineFolder(folderValue.trim())
      : null;

    if (!loadedRoutineId) {
      const duplicateRoutine = await findDuplicateRoutine(title, folderId);
      if (duplicateRoutine) {
        const duplicateDecision = promptDuplicateRoutine(
          duplicateRoutine,
          title,
          sheet
        );
        if (duplicateDecision === null) return null;

        if (duplicateDecision.shouldUpdate) {
          shouldUpdate = true;
          loadedRoutineId = duplicateDecision.routineId;
        }
      }
    }

    const exerciseData = sheet
      .getRange(`B8:I${sheet.getLastRow()}`)
      .getValues()
      .filter((row) => row[2] || row[0] || row[7]);

    if (!validateExerciseData(exerciseData)) {
      return null;
    }

    const exercises = processExercises(exerciseData);
    validateRoutineData(title, exercises);

    const routineData = {
      routine: {
        title,
        folder_id: folderId,
        notes: notes || null,
        exercises,
      },
    };

    const ss = getActiveSpreadsheet();
    let response;

    if (shouldUpdate && loadedRoutineId) {
      response = await updateRoutineFromSheet(loadedRoutineId, routineData);
      ss.toast(
        "Routine updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    } else {
      response = await submitRoutine(routineData);
      ss.toast(
        "Routine created successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );

      await showHtmlDialog("ui/dialogs/RoutineCreated", {
        width: DIALOG_DIMENSIONS.ROUTINE_CREATED_WIDTH,
        height: DIALOG_DIMENSIONS.ROUTINE_CREATED_HEIGHT,
      });
    }

    sheet.getRange("H1").clearContent();
    return response.routine || response;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Creating routine from sheet",
      sheetName: "Routine Builder",
    });
  }
}

/**
 * Clears the routine builder form while preserving formatting
 */
function clearRoutineBuilder() {
  try {
    const sheet = getRoutineBuilderSheet();
    if (!sheet) return;

    sheet.getRange("D2:H4").clearContent();
    sheet.getRange("B8:H").clearContent();

    const ss = getActiveSpreadsheet();
    ss.toast("Form cleared!", "Success", TOAST_DURATION.SHORT);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Clearing routine builder",
      sheetName: "Routine Builder",
    });
  }
}

/**
 * Builds a map of folder IDs to folder names from the Routine Folders sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - Active spreadsheet
 * @returns {Map<string, string>} Map of folder ID to folder name
 * @private
 */
function buildFolderNameMap(ss) {
  const folderNameMap = new Map();
  const foldersSheet = ss.getSheetByName(ROUTINE_FOLDERS_SHEET_NAME);
  if (!foldersSheet) return folderNameMap;

  const lastRow = foldersSheet.getLastRow();
  if (lastRow <= 1) return folderNameMap;

  const headers = foldersSheet
    .getRange(1, 1, 1, foldersSheet.getLastColumn())
    .getValues()[0];
  const idIndex = headers.indexOf("ID");
  const titleIndex = headers.indexOf("Title");

  if (idIndex === -1 || titleIndex === -1) return folderNameMap;

  const numRows = lastRow - 1;
  const idData = foldersSheet.getRange(2, idIndex + 1, numRows, 1).getValues();
  const titleData = foldersSheet
    .getRange(2, titleIndex + 1, numRows, 1)
    .getValues();

  for (let i = 0; i < numRows; i++) {
    const folderId = idData[i][0];
    const folderTitle = titleData[i][0];
    if (folderId && folderTitle) {
      folderNameMap.set(String(folderId), String(folderTitle));
    }
  }

  return folderNameMap;
}

/**
 * Reads routines from the Routines sheet
 * @param {GoogleAppsScript.Spreadsheet.Sheet} routinesSheet - Routines sheet
 * @param {Map<string, string>} folderNameMap - Map of folder ID to folder name
 * @returns {Array<Object>|null} Array of routine objects or null if sheet is invalid
 * @private
 */
function readRoutinesFromSheet(routinesSheet, folderNameMap) {
  const lastRow = routinesSheet.getLastRow();
  if (lastRow <= 1) return null;

  const headers = routinesSheet
    .getRange(1, 1, 1, routinesSheet.getLastColumn())
    .getValues()[0];
  const idIndex = headers.indexOf("ID");
  const titleIndex = headers.indexOf("Title");
  const folderIdIndex = headers.indexOf("Folder ID");
  const updatedAtIndex = headers.indexOf("Updated At");

  if (
    idIndex === -1 ||
    titleIndex === -1 ||
    folderIdIndex === -1 ||
    updatedAtIndex === -1
  ) {
    return null;
  }

  const numRows = lastRow - 1;
  const idCol = idIndex + 1;
  const titleCol = titleIndex + 1;
  const folderIdCol = folderIdIndex + 1;
  const updatedAtCol = updatedAtIndex + 1;

  const idData = routinesSheet.getRange(2, idCol, numRows, 1).getValues();
  const titleData = routinesSheet.getRange(2, titleCol, numRows, 1).getValues();
  const folderIdData = routinesSheet
    .getRange(2, folderIdCol, numRows, 1)
    .getValues();
  const updatedAtData = routinesSheet
    .getRange(2, updatedAtCol, numRows, 1)
    .getValues();

  const routinesMap = new Map();

  for (let i = 0; i < numRows; i++) {
    const routineId = String(idData[i][0] || "").trim();
    if (!routineId || routineId === "N/A") continue;

    if (!routinesMap.has(routineId)) {
      const title = String(titleData[i][0] || "").trim();
      const folderId = folderIdData[i][0];
      const updatedAt = updatedAtData[i][0];

      const folderName = folderId
        ? folderNameMap.get(String(folderId)) || null
        : null;

      routinesMap.set(routineId, {
        id: routineId,
        title: title || "Untitled Routine",
        folder_id: folderId || null,
        folder_name: folderName,
        updated_at: updatedAt || null,
      });
    }
  }

  return Array.from(routinesMap.values());
}

/**
 * Sorts routines by updated_at descending
 * @param {Array<Object>} routines - Array of routine objects
 * @returns {Array<Object>} Sorted routines
 * @private
 */
function sortRoutinesByUpdatedAt(routines) {
  return routines.sort((a, b) => {
    if (!a.updated_at && !b.updated_at) return 0;
    if (!a.updated_at) return 1;
    if (!b.updated_at) return -1;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

/**
 * Fetches routines from API when sheet is unavailable
 * @param {ApiClient} client - API client instance
 * @param {Map<string, string>} folderNameMap - Map of folder ID to folder name
 * @returns {Promise<Array<Object>>} Array of routine objects
 * @private
 */
async function fetchRoutinesFromApi(client, folderNameMap) {
  const apiKey = client.apiKeyManager.getApiKeyFromProperties();
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }

  const routines = [];
  const importManager = client.importManager;
  let page = 1;
  let hasMore = true;
  const maxPages = Math.ceil(ROUTINE_DROPDOWN_LIMIT / PAGE_SIZE.ROUTINES);

  while (
    hasMore &&
    page <= maxPages &&
    routines.length < ROUTINE_DROPDOWN_LIMIT
  ) {
    try {
      const response = await importManager.fetchPage(
        API_ENDPOINTS.ROUTINES,
        apiKey,
        page,
        PAGE_SIZE.ROUTINES,
        {}
      );

      const routineList = response.routines || [];
      if (!routineList || routineList.length === 0) {
        hasMore = false;
        break;
      }

      for (const routine of routineList) {
        if (routines.length >= ROUTINE_DROPDOWN_LIMIT) break;

        const folderName = routine.folder_id
          ? folderNameMap.get(String(routine.folder_id)) || null
          : null;

        routines.push({
          id: routine.id,
          title: routine.title || "Untitled Routine",
          folder_id: routine.folder_id || null,
          folder_name: folderName,
          updated_at: routine.updated_at || null,
        });
      }

      hasMore = routineList.length === PAGE_SIZE.ROUTINES;
      page++;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.statusCode === HTTP_STATUS.NOT_FOUND
      ) {
        hasMore = false;
        break;
      }
      throw error;
    }
  }

  return routines;
}

/**
 * Gets a list of routines for the selection dialog
 * First tries to read from Routines sheet, falls back to API if needed
 * Uses caching for performance on subsequent calls
 * @returns {Promise<Array<Object>>} Array of routine objects with id, title, folder_id, folder_name, updated_at
 */
async function getRoutinesList() {
  try {
    const ss = getActiveSpreadsheet();
    const routinesSheet = ss.getSheetByName(ROUTINES_SHEET_NAME);
    const client = getApiClient();
    const cacheManager = client.cacheManager;

    const cacheKey = routinesSheet
      ? `routines_list_sheet_${routinesSheet.getLastRow()}`
      : "routines_list_no_sheet";

    const cached = cacheManager.getCachedResponse(cacheKey);
    if (cached) return cached;

    const folderNameMap = buildFolderNameMap(ss);

    if (routinesSheet) {
      const routines = readRoutinesFromSheet(routinesSheet, folderNameMap);
      if (routines && routines.length > 0) {
        const sortedRoutines = sortRoutinesByUpdatedAt(routines);
        cacheManager.storeInCache(cacheKey, sortedRoutines);
        return sortedRoutines;
      }
    }

    const routines = await fetchRoutinesFromApi(client, folderNameMap);
    const sortedRoutines = sortRoutinesByUpdatedAt(routines);
    cacheManager.storeInCache(cacheKey, sortedRoutines);
    return sortedRoutines;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting routines list",
    });
  }
}

/**
 * Loads a routine into the Routine Builder sheet for editing
 * @param {string} routineId - Routine ID to load
 * @returns {Promise<void>}
 */
async function loadRoutineIntoBuilder(routineId) {
  try {
    const client = getApiClient();
    const apiKey = client.apiKeyManager.getApiKeyFromProperties();
    if (!apiKey) {
      throw new ConfigurationError("API key not found");
    }

    const options = client.createRequestOptions(apiKey);
    const response = await client.makeRequest(
      `${API_ENDPOINTS.ROUTINES}/${routineId}`,
      options
    );

    const routine = response.routine || response;
    if (!routine) {
      throw new ApiError("Routine not found", 404);
    }

    populateRoutineBuilderSheet(routine);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Loading routine into builder",
      routineId,
    });
  }
}
