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
 * @private
 */
const getRoutineBuilderSheet = () => {
  const sheet = getActiveSpreadsheet().getSheetByName("Routine Builder");
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      "Missing 'Routine Builder' Sheet",
      MISSING_SHEET_MESSAGE,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
  return sheet;
};

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

    const response = await submitRoutine(routineData);

    const ss = getActiveSpreadsheet();
    ss.toast("Routine created successfully!", "Success", TOAST_DURATION.NORMAL);

    await showHtmlDialog("ui/dialogs/RoutineCreated", {
      width: DIALOG_DIMENSIONS.ROUTINE_CREATED_WIDTH,
      height: DIALOG_DIMENSIONS.ROUTINE_CREATED_HEIGHT,
      title: "Routine Builder",
    });
    return response.routine;
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
 * Processes exercise data from sheet into API format
 * @private
 */
function processExercises(exerciseData) {
  try {
    const ss = getActiveSpreadsheet();
    const exercisesSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);
    const exerciseValues = exercisesSheet.getDataRange().getValues();
    const headersRow = exerciseValues.shift();
    const idCol = headersRow.indexOf("ID");
    const typeCol = headersRow.indexOf("Type");
    const templateTypeMap = {};
    exerciseValues.forEach((row) => {
      const id = String(row[idCol]).trim();
      const type = row[typeCol];
      if (id) templateTypeMap[id] = type;
    });

    const exercises = [];
    let currentExercise = null;
    let currentTemplateId = null;

    const weightUnit =
      ss.getSheetByName("Main").getRange("I5").getValue() || "kg";

    const conversionFactors = {
      lbs: WEIGHT_CONVERSION.LBS_TO_KG,
      stone: WEIGHT_CONVERSION.STONE_TO_KG,
      kg: 1,
    };
    const conversionFactor = conversionFactors[weightUnit] || 1;

    exerciseData.forEach((row) => {
      let [name, rest, setType, weight, reps, notes, supersetId, templateId] =
        row;
      templateId = templateId ? String(templateId).trim() : null;
      if (!templateId) {
        throw new ValidationError(`Missing template ID for exercise: ${name}`);
      }

      rest = parseNumber(rest, "rest");
      weight = parseNumber(weight, "weight");
      reps = parseNumber(reps, "reps");
      supersetId = parseNumber(supersetId, "superset ID");

      if (weight !== null) {
        weight = weight * conversionFactor;
      }

      if (templateId !== currentTemplateId) {
        if (currentExercise) {
          exercises.push(currentExercise);
        }
        currentExercise = createNewExercise(
          templateId,
          rest,
          supersetId,
          notes
        );
        currentTemplateId = templateId;
      }

      if (currentExercise) {
        currentExercise.sets.push(
          createSet(setType, weight, reps, templateTypeMap[templateId])
        );
      }
    });

    if (currentExercise) {
      exercises.push(currentExercise);
    }

    return exercises;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing exercises",
      exerciseCount: exerciseData.length,
    });
  }
}

/**
 * Validates the routine data before submission to ensure all required fields are present
 * @param {string} title - Routine title to validate
 * @param {Array<RoutineExercise>} exercises - Array of exercises to validate
 * @throws {ValidationError} If validation fails with detailed error messages
 * @private
 */
function validateRoutineData(title, exercises) {
  const errors = [];

  if (!title) {
    errors.push("Routine title is required");
  }

  if (!exercises || exercises.length === 0) {
    errors.push("At least one exercise is required");
  } else {
    exercises.forEach((exercise, index) => {
      if (!exercise.exercise_template_id) {
        errors.push(
          `Exercise at position ${index + 1} is missing a template ID`
        );
      }

      if (!exercise.sets || exercise.sets.length === 0) {
        errors.push(
          `Exercise at position ${index + 1} requires at least one set`
        );
      }

      exercise.sets?.forEach((set, setIndex) => {
        if (!set.type) {
          errors.push(
            `Set ${setIndex + 1} of exercise ${index + 1} is missing a type`
          );
        }
      });
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(`Validation failed:\n${errors.join("\n")}`);
  }
}

/**
 * Gets or creates a routine folder by name
 * First attempts to find an existing folder, then creates one if not found
 * @param {string} folderName - Name of the folder to get or create
 * @returns {Promise<number|null>} Folder ID if found/created, null if folderName is empty or "(No Folder)"
 * @throws {ApiError} If folder creation fails
 * @private
 */
async function getOrCreateRoutineFolder(folderName) {
  try {
    if (folderName == "(No Folder)" || !folderName) {
      return null;
    }

    const existingFolder = await findRoutineFolder(folderName);
    if (existingFolder) {
      return existingFolder;
    }

    const newFolderId = await createNewRoutineFolder(folderName);
    if (!newFolderId) {
      throw new ApiError("Failed to get ID for created folder");
    }

    return newFolderId;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Managing routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Gets API key for routine operations
 * @returns {string} API key
 * @throws {ConfigurationError} If properties or API key not found
 * @private
 */
function getRoutineApiKey() {
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
 * Finds a routine folder by name
 * @param {string} folderName - Name of the folder to find
 * @returns {Promise<number|null>} Folder ID or null if not found
 */
async function findRoutineFolder(folderName) {
  const apiKey = getRoutineApiKey();
  const options = apiClient.createRequestOptions(apiKey);

  try {
    const response = await apiClient.makeRequest(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      options,
      { page: 1, page_size: PAGE_SIZE.ROUTINE_FOLDERS }
    );

    const folders = response.routine_folders || [];
    const matchingFolder = folders.find(
      (folder) => folder.title.toLowerCase() === folderName.toLowerCase()
    );

    return matchingFolder ? matchingFolder.id : null;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Finding routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Creates a new routine folder
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<number>} ID of the newly created folder
 * @private
 */
async function createNewRoutineFolder(folderName) {
  const apiKey = getRoutineApiKey();
  const options = apiClient.createRequestOptions(apiKey, "post", {
    "Content-Type": "application/json",
  });

  try {
    const payload = { routine_folder: { title: folderName } };
    const response = await apiClient.makeRequest(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      options,
      {},
      payload
    );

    const folderId = response.routine_folder?.id;
    if (!folderId) {
      throw new ApiError(
        "Invalid folder creation response structure",
        0,
        JSON.stringify(response)
      );
    }
    return folderId;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Creating routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Creates a new exercise object
 * @private
 */
function createNewExercise(templateId, rest, supersetId, notes) {
  return {
    exercise_template_id: templateId,
    superset_id: supersetId || null,
    notes: notes?.toString().trim() || null,
    rest_seconds: rest,
    sets: [],
  };
}

/**
 * Creates a set object from processed values
 * @private
 */
function createSet(setType, weight, reps, templateType) {
  return {
    type: setType || "normal",
    weight_kg: templateType?.toLowerCase().includes("duration") ? null : weight,
    reps: templateType?.toLowerCase().includes("distance") ? null : reps,
    distance_meters: templateType?.toLowerCase().includes("distance")
      ? reps
      : null,
    duration_seconds: templateType?.toLowerCase().includes("duration")
      ? weight
      : null,
  };
}

/**
 * Submits routine to the API
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 * @private
 */
async function submitRoutine(routineData) {
  const apiKey = getRoutineApiKey();
  const options = apiClient.createRequestOptions(apiKey, "post", {
    "Content-Type": "application/json",
  });

  try {
    const response = await apiClient.makeRequest(
      API_ENDPOINTS.ROUTINES,
      options,
      {},
      routineData
    );
    return response;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Submitting routine to API",
      routineTitle: routineData.routine.title,
    });
  }
}
