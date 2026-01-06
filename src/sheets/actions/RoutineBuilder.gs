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
 * Finds an existing routine with the same title and folder_id
 * @param {string} title - Routine title to search for
 * @param {number|null} folderId - Folder ID to match (null for no folder)
 * @returns {Promise<Object|null>} Matching routine object or null if not found
 */
async function findDuplicateRoutine(title, folderId) {
  try {
    const routines = await getRoutinesList();
    const normalizedTitle = String(title).trim().toLowerCase();

    for (const routine of routines) {
      const routineTitle = String(routine.title || "")
        .trim()
        .toLowerCase();
      const routineFolderId = routine.folder_id || null;

      // Match if titles are the same (case-insensitive) and folder IDs match
      if (routineTitle === normalizedTitle && routineFolderId === folderId) {
        return routine;
      }
    }

    return null;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding duplicate routine",
      routineTitle: title,
      folderId: folderId,
    });
  }
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

  const titleCell = sheet.getRange("D2");
  const title = String(titleCell.getValue()).trim();
  if (!title) {
    SpreadsheetApp.getUi().alert(
      "Routine title is required",
      "Please enter a name for your routine in cell D2 before saving.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  try {
    let loadedRoutineId = sheet.getRange("H1").getValue();
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

    const folderValue = sheet.getRange("D3").getValue();
    const notes = sheet.getRange("D4").getValue();

    const folderId = folderValue?.trim()
      ? await getOrCreateRoutineFolder(folderValue.trim())
      : null;

    // Check for duplicate routine if not updating an existing loaded routine
    if (!loadedRoutineId) {
      const duplicateRoutine = await findDuplicateRoutine(title, folderId);
      if (duplicateRoutine) {
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

        if (response === ui.Button.CANCEL) {
          return null;
        }

        if (response === ui.Button.YES) {
          shouldUpdate = true;
          loadedRoutineId = duplicateRoutine.id;
          // Store the duplicate routine ID in H1 so it can be used for update
          sheet.getRange("H1").setValue(duplicateRoutine.id);
        }
      }
    }

    const exerciseData = sheet
      .getRange("B8:I" + sheet.getLastRow())
      .getValues()
      .filter((row) => row[2] || row[0] || row[7]);

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
 * Gets a list of routines for the selection dialog
 * First tries to read from Routines sheet, falls back to API if needed
 * Uses caching to improve performance on subsequent calls
 * @returns {Promise<Array<Object>>} Array of routine objects with id, title, folder_id, folder_name, updated_at
 */
async function getRoutinesList() {
  try {
    const ss = getActiveSpreadsheet();
    const routinesSheet = ss.getSheetByName(ROUTINES_SHEET_NAME);
    const client = getApiClient();
    const cacheManager = client.cacheManager;

    // Build cache key based on sheet state
    let cacheKey = "routines_list_";
    if (routinesSheet) {
      const lastRow = routinesSheet.getLastRow();
      const lastModified = routinesSheet.getParent().getLastEdited();
      cacheKey += `sheet_${lastRow}_${lastModified.getTime()}`;
    } else {
      cacheKey += "no_sheet";
    }

    // Check cache first
    const cached = cacheManager.getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }

    // Build folder name map from Routine Folders sheet
    const folderNameMap = new Map();
    const foldersSheet = ss.getSheetByName(ROUTINE_FOLDERS_SHEET_NAME);
    if (foldersSheet) {
      // Optimize: only read ID and Title columns
      const lastRow = foldersSheet.getLastRow();
      if (lastRow > 1) {
        const headers = foldersSheet
          .getRange(1, 1, 1, foldersSheet.getLastColumn())
          .getValues()[0];
        const idIndex = headers.indexOf("ID");
        const titleIndex = headers.indexOf("Title");

        if (idIndex !== -1 && titleIndex !== -1) {
          // Optimize: only read ID and Title columns instead of all data
          const idData = foldersSheet
            .getRange(2, idIndex + 1, lastRow - 1, 1)
            .getValues();
          const titleData = foldersSheet
            .getRange(2, titleIndex + 1, lastRow - 1, 1)
            .getValues();

          for (let i = 0; i < idData.length; i++) {
            const folderId = idData[i][0];
            const folderTitle = titleData[i][0];
            if (folderId && folderTitle) {
              folderNameMap.set(String(folderId), String(folderTitle));
            }
          }
        }
      }
    }

    // Try to get routines from sheet first
    if (routinesSheet) {
      const lastRow = routinesSheet.getLastRow();
      if (lastRow > 1) {
        const headers = routinesSheet
          .getRange(1, 1, 1, routinesSheet.getLastColumn())
          .getValues()[0];
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

          // Optimize: only read necessary columns (ID, Title, Folder ID, Updated At)
          // Read all rows but only the columns we need
          const numRows = lastRow - 1;
          const idCol = idIndex + 1;
          const titleCol = titleIndex + 1;
          const folderIdCol = folderIdIndex + 1;
          const updatedAtCol = updatedAtIndex + 1;

          // Read columns in batches for better performance
          const idData = routinesSheet
            .getRange(2, idCol, numRows, 1)
            .getValues();
          const titleData = routinesSheet
            .getRange(2, titleCol, numRows, 1)
            .getValues();
          const folderIdData = routinesSheet
            .getRange(2, folderIdCol, numRows, 1)
            .getValues();
          const updatedAtData = routinesSheet
            .getRange(2, updatedAtCol, numRows, 1)
            .getValues();

          // Process rows - each routine may have multiple rows (one per exercise)
          for (let i = 0; i < numRows; i++) {
            const routineId = String(idData[i][0] || "").trim();
            if (!routineId || routineId === "N/A") continue;

            // Only add if we haven't seen this routine ID yet
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

          const routines = Array.from(routinesMap.values());
          if (routines.length > 0) {
            // Sort by updated_at descending (most recent first)
            routines.sort((a, b) => {
              if (!a.updated_at && !b.updated_at) return 0;
              if (!a.updated_at) return 1;
              if (!b.updated_at) return -1;
              return new Date(b.updated_at) - new Date(a.updated_at);
            });

            // Cache the result
            cacheManager.storeInCache(cacheKey, routines);
            return routines;
          }
        }
      }
    }

    // Fall back to API if sheet is empty or doesn't exist
    const apiKey = client.apiKeyManager.getApiKeyFromProperties();
    if (!apiKey) {
      throw new ConfigurationError("API key not found");
    }

    const routines = [];
    const importManager = client.importManager;

    // Manually fetch pages until we have enough routines (limited fetch for performance)
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
          // Stop if we've reached the limit
          if (routines.length >= ROUTINE_DROPDOWN_LIMIT) {
            break;
          }

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

        // Check if there are more pages
        hasMore = routineList.length === PAGE_SIZE.ROUTINES;
        page++;
      } catch (error) {
        // If 404, no more pages
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

    // Sort by updated_at descending
    routines.sort((a, b) => {
      if (!a.updated_at && !b.updated_at) return 0;
      if (!a.updated_at) return 1;
      if (!b.updated_at) return -1;
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    // Cache the result
    cacheManager.storeInCache(cacheKey, routines);

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
