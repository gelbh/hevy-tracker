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
 * Handles routine creation and submission to Hevy API with enhanced UI and validation
 * @module RoutineBuilder
 */

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

  const titleCell = sheet.getRange("C2");
  const title = String(titleCell.getValue()).trim();
  if (!title) {
    SpreadsheetApp.getUi().alert(
      "Routine title is required",
      "Please enter a name for your routine in cell C2 before saving.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  try {
    const loadedRoutineId = sheet.getRange("H1").getValue();
    let shouldUpdate = false;

    if (loadedRoutineId) {
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

      if (response === ui.Button.CANCEL) {
        return null;
      }

      shouldUpdate = response === ui.Button.YES;
    }

    const folderValue = sheet.getRange("C3").getValue();
    const notes = sheet.getRange("C4").getValue();

    const folderId = folderValue?.trim()
      ? await getOrCreateRoutineFolder(folderValue.trim())
      : null;

    const exerciseData = sheet
      .getRange("A8:H" + sheet.getLastRow())
      .getValues()
      .filter((row) => row[0] && row[2]);

    if (exerciseData.length === 0) {
      SpreadsheetApp.getUi().alert(
        "At least one exercise with a set type is required",
        "Please add at least one exercise with a set type in the table.",
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }

    const missing = exerciseData.filter((row) => {
      const id = String(row[7]).trim().toUpperCase();
      return !id || id === "N/A";
    });
    if (missing.length) {
      const names = missing.map((r) => r[0]).join(", ");
      SpreadsheetApp.getUi().alert(
        "Missing Exercise IDs",
        `The following exercises are not in your Hevy account: ${names}.\n` +
          "Please add them as custom exercises on Hevy, re-run 'Import Exercises' to sync IDs, and try again.",
        SpreadsheetApp.getUi().ButtonSet.OK
      );
      return;
    }

    const exercises = processExercises(exerciseData);
    validateRoutineData(title, exercises);

    const routineData = {
      routine: {
        title: title,
        folder_id: folderId,
        notes: notes || null,
        exercises: exercises,
      },
    };

    let response;
    if (shouldUpdate && loadedRoutineId) {
      response = await updateRoutineFromSheet(loadedRoutineId, routineData);
      const ss = getActiveSpreadsheet();
      ss.toast(
        "Routine updated successfully!",
        "Success",
        TOAST_DURATION.NORMAL
      );
    } else {
      response = await submitRoutine(routineData);
      const ss = getActiveSpreadsheet();
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

    // Clear the loaded routine ID after successful save
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

    sheet.getRange("C2:H4").clearContent();
    sheet.getRange("A8:G").clearContent();

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
 * Gets a list of routines for the selection dialog
 * First tries to read from Routines sheet, falls back to API if needed
 * @returns {Promise<Array<Object>>} Array of routine objects with id, title, folder_id, folder_name, updated_at
 */
async function getRoutinesList() {
  try {
    const ss = getActiveSpreadsheet();
    const routinesSheet = ss.getSheetByName(ROUTINES_SHEET_NAME);

    // Build folder name map from Routine Folders sheet
    const folderNameMap = new Map();
    const foldersSheet = ss.getSheetByName(ROUTINE_FOLDERS_SHEET_NAME);
    if (foldersSheet) {
      const folderData = foldersSheet.getDataRange().getValues();
      if (folderData.length > 1) {
        const headers = folderData[0];
        const idIndex = headers.indexOf("ID");
        const titleIndex = headers.indexOf("Title");

        if (idIndex !== -1 && titleIndex !== -1) {
          for (let i = 1; i < folderData.length; i++) {
            const row = folderData[i];
            const folderId = row[idIndex];
            const folderTitle = row[titleIndex];
            if (folderId && folderTitle) {
              folderNameMap.set(String(folderId), String(folderTitle));
            }
          }
        }
      }
    }

    // Try to get routines from sheet first
    if (routinesSheet) {
      const routineData = routinesSheet.getDataRange().getValues();
      if (routineData.length > 1) {
        const headers = routineData[0];
        const idIndex = headers.indexOf("ID");
        const titleIndex = headers.indexOf("Title");
        const folderIdIndex = headers.indexOf("Folder ID");
        const updatedAtIndex = headers.indexOf("Updated At");

        if (
          idIndex !== -1 &&
          titleIndex !== -1 &&
          folderIdIndex !== -1 &&
          updatedAtIndex !== -1
        ) {
          const routinesMap = new Map();

          // Process rows - each routine may have multiple rows (one per exercise)
          for (let i = 1; i < routineData.length; i++) {
            const row = routineData[i];
            const routineId = String(row[idIndex] || "").trim();
            if (!routineId || routineId === "N/A") continue;

            // Only add if we haven't seen this routine ID yet
            if (!routinesMap.has(routineId)) {
              const title = String(row[titleIndex] || "").trim();
              const folderId = row[folderIdIndex];
              const updatedAt = row[updatedAtIndex];

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

          const routines = Array.from(routinesMap.values());
          if (routines.length > 0) {
            // Sort by updated_at descending (most recent first)
            routines.sort((a, b) => {
              if (!a.updated_at && !b.updated_at) return 0;
              if (!a.updated_at) return 1;
              if (!b.updated_at) return -1;
              return new Date(b.updated_at) - new Date(a.updated_at);
            });
            return routines;
          }
        }
      }
    }

    // Fall back to API if sheet is empty or doesn't exist
    const apiKey = getApiClient().apiKeyManager.getApiKeyFromProperties();
    if (!apiKey) {
      throw new ConfigurationError("API key not found");
    }

    const client = getApiClient();
    const options = client.createRequestOptions(apiKey);

    const routines = [];
    const processRoutinePage = async (routineList) => {
      for (const routine of routineList) {
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
    };

    await client.fetchPaginatedData(
      API_ENDPOINTS.ROUTINES,
      PAGE_SIZE.ROUTINES,
      processRoutinePage,
      "routines",
      {}
    );

    // Sort by updated_at descending
    routines.sort((a, b) => {
      if (!a.updated_at && !b.updated_at) return 0;
      if (!a.updated_at) return 1;
      if (!b.updated_at) return -1;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    return routines;
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
    const apiKey = getApiClient().apiKeyManager.getApiKeyFromProperties();
    if (!apiKey) {
      throw new ConfigurationError("API key not found");
    }

    const client = getApiClient();
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
      routineId: routineId,
    });
  }
}
