/**
 * Handles routine creation and submission to Hevy API with enhanced UI and validation
 */

/**
 * Creates a routine from the sheet data and submits it to Hevy
 * @returns {Promise<Object>} Created routine data
 */
async function createRoutineFromSheet() {
  const ui = SpreadsheetApp.getUi();
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Routine Builder");
  const titleCell = sheet.getRange("C2");
  const title = String(titleCell.getValue()).trim();
  if (!title) {
    ui.alert(
      "Routine title is required",
      "Please enter a name for your routine in cell C2 before saving.",
      ui.ButtonSet.OK
    );
    return;
  }

  try {
    const folderValue = sheet.getRange("C3").getValue();
    const notes = sheet.getRange("C4").getValue();

    let folderId = null;
    if (folderValue?.trim()) {
      folderId = await getOrCreateRoutineFolder(folderValue.trim());
    }

    const exerciseData = sheet
      .getRange("A8:H" + sheet.getLastRow())
      .getValues()
      .filter((row) => row[0] && row[2]);

    if (exerciseData.length === 0) {
      ui.alert(
        "At least one exercise with a set type is required",
        "Please add at least one exercise with a set type in the table.",
        ui.ButtonSet.OK
      );
      return;
    }

    const missing = exerciseData.filter((row) => {
      const id = String(row[7]).trim().toUpperCase();
      return !id || id === "N/A";
    });
    if (missing.length) {
      const names = missing.map((r) => r[0]).join(", ");
      ui.alert(
        "Missing Exercise IDs",
        `The following exercises are not in your Hevy account: ${names}.\n` +
          "Please add them as custom exercises on Hevy, re-run 'Import Exercises' to sync IDs, and try again.",
        ui.ButtonSet.OK
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

    await handleSuccessfulSubmission();
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
    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Routine Builder");

    if (!sheet) {
      throw new SheetError(
        "Routine Builder sheet not found",
        "Routine Builder"
      );
    }

    sheet.getRange("C2:H4").clearContent();
    sheet.getRange("A8:G").clearContent();

    showProgress("Form cleared!", "Success", TOAST_DURATION.SHORT);
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName("Main")
        .getRange("I5")
        .getValue() || "kg";
    const conversionFactor =
      weightUnit === "lbs" ? 0.45359237 : weightUnit === "stone" ? 6.35029 : 1;

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
 * Validates the routine data before submission
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
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }
}

/**
 * Gets or creates a routine folder
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
 * Finds a routine folder by name
 */
async function findRoutineFolder(folderName) {
  const options = apiClient.createRequestOptions(
    getDocumentProperties().getProperty("HEVY_API_KEY")
  );

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
 * @private
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<number>} ID of the newly created folder
 */
async function createNewRoutineFolder(folderName) {
  const apiKey = getDocumentProperties().getProperty("HEVY_API_KEY");
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }

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
 * @private
 * @param {Object} routineData - The routine payload to send
 * @returns {Promise<Object>} Parsed response from the API
 */
async function submitRoutine(routineData) {
  const apiKey = getDocumentProperties().getProperty("HEVY_API_KEY");
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }

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

/**
 * Handles successful routine submission
 * @private
 */
async function handleSuccessfulSubmission() {
  showProgress(
    "Routine created successfully!",
    "Success",
    TOAST_DURATION.NORMAL
  );

  await showHtmlDialog("src/ui/dialogs/RoutineCreated", {
    width: 400,
    height: 300,
    title: "Routine Builder",
  });
}
