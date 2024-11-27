/**
 * RoutineBuilder.gs
 * Handles routine creation and submission to Hevy API with enhanced UI and validation
 */

/**
 * Creates a routine from the sheet data and submits it to Hevy
 * @returns {Promise<Object>} Created routine data
 * @throws {ApiError} If routine creation fails
 */
async function createRoutineFromSheet() {
  try {
    const sheet =
      SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Routine Builder");
    if (!sheet) {
      throw new ValidationError("Routine Builder sheet not found");
    }

    // Get routine metadata
    const title = sheet.getRange("C2").getValue();
    const folderValue = sheet.getRange("C3").getValue();
    const notes = sheet.getRange("C4").getValue();

    // Handle folder assignment
    let folderId = null;
    if (folderValue && folderValue.trim()) {
      folderId = await getOrCreateRoutineFolder(folderValue.trim());
    }

    if (!title) {
      throw new ValidationError("Routine title is required");
    }

    // Get exercise data
    const exerciseData = sheet
      .getRange("A8:H" + sheet.getLastRow())
      .getValues()
      .filter((row) => row[0] && row[2]); // Filter rows that have exercise name and set type

    if (exerciseData.length === 0) {
      throw new ValidationError(
        "At least one exercise with a set type is required"
      );
    }

    // Process exercises
    const exercises = processExercises(exerciseData);

    // Validate the data
    validateRoutineData(title, exercises);

    // Prepare the routine data
    const routineData = {
      routine: {
        title: title,
        folder_id: folderId,
        notes: notes || null,
        exercises: exercises,
      },
    };

    Logger.debug("Submitting routine data:", routineData);

    // Create request options with proper error handling
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

    // Make the API request
    const response = UrlFetchApp.fetch(
      `${API_ENDPOINTS.BASE}${API_ENDPOINTS.ROUTINES}`,
      options
    );
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    // Handle different response scenarios
    if (responseCode === 201) {
      try {
        const responseData = JSON.parse(responseText);

        // Extract the first routine from the array in the response
        const createdRoutine = responseData.routine?.[0];

        if (!createdRoutine?.id) {
          throw new ApiError(
            "Invalid routine creation response format",
            responseCode,
            responseText
          );
        }

        showProgress(
          "Routine created successfully!",
          "Success",
          TOAST_DURATION.NORMAL
        );

        // Optionally clear the form
        const ui = SpreadsheetApp.getUi();
        const clearResponse = ui.alert(
          "Success",
          "Would you like to clear the form?",
          ui.ButtonSet.YES_NO
        );

        if (clearResponse === ui.Button.YES) {
          clearRoutineBuilder();
        }

        return createdRoutine;
      } catch (parseError) {
        Logger.debug("Response parsing error:", {
          error: parseError,
          responseText: responseText,
        });
        throw new ApiError(
          "Failed to parse routine creation response",
          responseCode,
          responseText
        );
      }
    } else {
      // Handle error responses
      let errorMessage = "Failed to create routine";
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorMessage;
      } catch (parseError) {
        // Use default error message if response parsing fails
      }

      throw new ApiError(errorMessage, responseCode, responseText);
    }
  } catch (error) {
    Logger.error("Error creating routine:", {
      error: error,
      message: error.message,
      stack: error.stack,
      context: error.context,
    });
    handleError(error, "Creating routine");
    throw error;
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

        Logger.debug("Created new folder:", {
          id: folderId,
          name: folderName,
        });
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
    Logger.error("Error creating routine folder:", { folderName, error });
    throw error;
  }
}

/**
 * Gets an existing folder ID by name or creates a new folder
 */
async function getOrCreateRoutineFolder(folderName) {
  try {
    // First, try to find existing folder
    const existingFolder = await findRoutineFolder(folderName);
    if (existingFolder) {
      Logger.debug("Found existing folder:", {
        id: existingFolder,
        name: folderName,
      });
      return existingFolder;
    }

    // If not found, create new folder and handle potential errors
    try {
      const newFolderId = await createNewRoutineFolder(folderName);
      if (!newFolderId) {
        Logger.error("Created folder but no ID returned", { folderName });
        throw new ApiError("Failed to get ID for created folder");
      }
      return newFolderId;
    } catch (createError) {
      // Check if folder was actually created despite error
      const retryFolder = await findRoutineFolder(folderName);
      if (retryFolder) {
        Logger.debug("Found folder after creation error:", {
          id: retryFolder,
          name: folderName,
        });
        return retryFolder;
      }
      throw createError;
    }
  } catch (error) {
    Logger.error("Error handling routine folder", {
      folderName,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Processes exercise data from sheet into API format
 */
function processExercises(exerciseData) {
  const exercises = [];
  let currentExercise = null;
  let currentTemplateId = null;

  exerciseData.forEach((row) => {
    const [name, rest, setType, weight, reps, notes, supersetId, templateId] =
      row;

    // Convert templateId to string if it's not already
    const processedTemplateId = templateId ? String(templateId).trim() : null;

    // Convert numeric values - ensure proper type conversion
    const processedWeight = weight ? Number(weight) : null;
    const processedReps = reps ? Number(reps) : null;
    const processedRest = rest ? Number(rest) : null;
    const processedSupersetId = supersetId ? Number(supersetId) : null;

    // Validate numeric conversions
    if (weight && isNaN(processedWeight))
      throw new Error(`Invalid weight value: ${weight}`);
    if (reps && isNaN(processedReps))
      throw new Error(`Invalid reps value: ${reps}`);
    if (rest && isNaN(processedRest))
      throw new Error(`Invalid rest value: ${rest}`);
    if (supersetId && isNaN(processedSupersetId))
      throw new Error(`Invalid superset ID: ${supersetId}`);

    // Check if we have a valid template ID
    if (!processedTemplateId) {
      throw new Error(`Missing template ID for exercise: ${name}`);
    }

    // Start new exercise if template ID changes
    if (processedTemplateId !== currentTemplateId) {
      if (currentExercise) {
        exercises.push(currentExercise);
      }

      // Initialize new exercise with notes as null if empty
      currentExercise = {
        exercise_template_id: processedTemplateId,
        superset_id: processedSupersetId || null,
        notes: notes && notes.toString().trim() ? notes.toString() : null,
        rest_seconds: processedRest,
        sets: [],
      };

      currentTemplateId = processedTemplateId;
    }

    // Validate set type
    if (!setType || typeof setType !== "string" || !setType.trim()) {
      throw new Error(`Invalid set type for exercise: ${name}`);
    }

    // Add set to current exercise
    if (currentExercise) {
      currentExercise.sets.push({
        type: setType.trim().toLowerCase() || "normal",
        weight_kg: processedWeight,
        reps: processedReps,
        distance_meters: null,
        duration_seconds: null,
      });
    }
  });

  // Add the last exercise if exists
  if (currentExercise) {
    exercises.push(currentExercise);
  }

  Logger.debug("Processed exercises:", { exercises });
  return exercises;
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
    Logger.error("Error finding routine folder", { folderName, error });
    throw error;
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
 * Clears the routine builder form while preserving formatting
 */
function clearRoutineBuilder() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Routine Builder");
  if (sheet) {
    sheet.getRange("C2:H4").clearContent();
    sheet.getRange("A8:G1000").clearContent();

    showProgress("Form cleared!", "Success", TOAST_DURATION.SHORT);
  }
}
