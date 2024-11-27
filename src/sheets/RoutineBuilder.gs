/**
 * Handles routine creation and submission to Hevy API with enhanced UI and validation
 */

/**
 * Creates a routine from the sheet data and submits it to Hevy
 * @returns {Promise<Object>} Created routine data
 */
async function createRoutineFromSheet() {
  try {
    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Routine Builder");
    if (!sheet) {
      throw new ValidationError("Routine Builder sheet not found");
    }

    // Get and validate routine metadata
    const title = sheet.getRange("C2").getValue();
    const folderValue = sheet.getRange("C3").getValue();
    const notes = sheet.getRange("C4").getValue();

    if (!title) {
      throw new ValidationError("Routine title is required");
    }

    // Handle folder assignment
    let folderId = null;
    if (folderValue?.trim()) {
      folderId = await getOrCreateRoutineFolder(folderValue.trim());
    }

    // Get and validate exercise data
    const exerciseData = sheet
      .getRange("A8:H" + sheet.getLastRow())
      .getValues()
      .filter((row) => row[0] && row[2]);

    if (exerciseData.length === 0) {
      throw new ValidationError(
        "At least one exercise with a set type is required"
      );
    }

    // Process and validate exercises
    const exercises = processExercises(exerciseData);
    validateRoutineData(title, exercises);

    // Prepare routine data
    const routineData = {
      routine: {
        title: title,
        folder_id: folderId,
        notes: notes || null,
        exercises: exercises,
      },
    };

    // Submit to API
    const response = await submitRoutine(routineData);

    await handleSuccessfulSubmission(response);
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
    sheet.getRange("A8:G1000").clearContent();

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
    const exercises = [];
    let currentExercise = null;
    let currentTemplateId = null;

    exerciseData.forEach((row) => {
      const [name, rest, setType, weight, reps, notes, supersetId, templateId] =
        row;

      // Validate template ID
      const processedTemplateId = templateId ? String(templateId).trim() : null;
      if (!processedTemplateId) {
        throw new ValidationError(`Missing template ID for exercise: ${name}`);
      }

      // Process numeric values
      const processedValues = validateAndProcessNumericValues(row);

      // Handle exercise grouping
      if (processedTemplateId !== currentTemplateId) {
        if (currentExercise) {
          exercises.push(currentExercise);
        }

        currentExercise = createNewExercise(
          processedTemplateId,
          processedValues,
          notes
        );
        currentTemplateId = processedTemplateId;
      }

      // Add set to current exercise
      if (currentExercise) {
        currentExercise.sets.push(createSet(setType, processedValues));
      }
    });

    // Add the last exercise
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
    if (folderName == "(No Folder)") {
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
    getUserProperties().getProperty("HEVY_API_KEY")
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
 * @param {string} folderName - Name for the new folder
 * @returns {Promise<number>} ID of the newly created folder
 */
async function createNewRoutineFolder(folderName) {
  const options = apiClient.createRequestOptions(
    getUserProperties().getProperty("HEVY_API_KEY"),
    "post",
    { "Content-Type": "application/json" }
  );

  try {
    const folderData = {
      routine_folder: {
        title: folderName,
      },
    };

    // Make the request directly using UrlFetchApp
    const response = UrlFetchApp.fetch(
      `${API_ENDPOINTS.BASE}${API_ENDPOINTS.ROUTINE_FOLDERS}`,
      {
        method: "post",
        contentType: "application/json",
        headers: options.headers,
        payload: JSON.stringify(folderData),
        muteHttpExceptions: true,
      }
    );

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 201) {
      try {
        const responseData = JSON.parse(responseText);
        // Extract ID from the nested routine_folder object
        const folderId = responseData.routine_folder?.id;

        if (!folderId) {
          throw new ApiError(
            "Invalid folder creation response structure",
            responseCode,
            responseText
          );
        }

        return folderId;
      } catch (parseError) {
        throw new ApiError(
          "Failed to parse folder creation response",
          responseCode,
          responseText
        );
      }
    } else {
      let errorMessage = "Failed to create folder";
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        // Use default error message if parsing fails
      }
      throw new ApiError(errorMessage, responseCode, responseText);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Creating routine folder",
      folderName: folderName,
    });
  }
}

/**
 * Validates and processes numeric values from row data
 * @private
 */
function validateAndProcessNumericValues(row) {
  const [_, rest, __, weight, reps, ___, supersetId] = row;

  const processed = {
    weight: weight ? Number(weight) : null,
    reps: reps ? Number(reps) : null,
    rest: rest ? Number(rest) : null,
    supersetId: supersetId ? Number(supersetId) : null,
  };

  // Validate conversions
  if (weight && isNaN(processed.weight))
    throw new ValidationError(`Invalid weight value: ${weight}`);
  if (reps && isNaN(processed.reps))
    throw new ValidationError(`Invalid reps value: ${reps}`);
  if (rest && isNaN(processed.rest))
    throw new ValidationError(`Invalid rest value: ${rest}`);
  if (supersetId && isNaN(processed.supersetId))
    throw new ValidationError(`Invalid superset ID: ${supersetId}`);

  return processed;
}

/**
 * Creates a new exercise object
 * @private
 */
function createNewExercise(templateId, values, notes) {
  return {
    exercise_template_id: templateId,
    superset_id: values.supersetId || null,
    notes: notes?.toString().trim() || null,
    rest_seconds: values.rest,
    sets: [],
  };
}

/**
 * Creates a set object from processed values
 * @private
 */
function createSet(setType, values) {
  return {
    type: setType || "normal",
    weight_kg: values.weight,
    reps: values.reps,
    distance_meters: null,
    duration_seconds: null,
  };
}

/**
 * Submits routine to the API
 * @private
 */
async function submitRoutine(routineData) {
  const apiKey = getUserProperties().getProperty("HEVY_API_KEY");
  if (!apiKey) {
    throw new ConfigurationError("API key not found");
  }

  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Api-Key": apiKey,
      Accept: "application/json",
    },
    payload: JSON.stringify(routineData),
    muteHttpExceptions: true,
  };

  try {
    const response = await UrlFetchApp.fetch(
      `${API_ENDPOINTS.BASE}${API_ENDPOINTS.ROUTINES}`,
      options
    );

    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 201) {
      throw new ApiError(
        JSON.parse(responseText)?.error || "Failed to create routine",
        responseCode,
        responseText
      );
    }

    return JSON.parse(responseText);
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
async function handleSuccessfulSubmission(response) {
  showProgress(
    "Routine created successfully!",
    "Success",
    TOAST_DURATION.NORMAL
  );

  const ui = SpreadsheetApp.getUi();
  const clearResponse = ui.alert(
    "Success",
    "Would you like to clear the form?",
    ui.ButtonSet.YES_NO
  );

  if (clearResponse === ui.Button.YES) {
    await clearRoutineBuilder();
  }
}
