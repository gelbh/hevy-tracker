/**
 * Data transformation utilities for converting between sheet format and API format.
 * @module actions/RoutineBuilderDataProcessor
 */

const MAIN_SHEET_NAME = "Main";
const WEIGHT_UNIT_CELL = "I5";
const DEFAULT_WEIGHT_UNIT = "kg";

/**
 * Processes exercise data from sheet into API format
 * @param {Array<Array>} exerciseData - Raw exercise data from sheet
 * @returns {Array<RoutineExercise>} Processed exercises in API format
 */
function processExercises(exerciseData) {
  try {
    const templateTypeMap = buildTemplateTypeMap();
    const conversionFactor = getWeightConversionFactor();
    const exercises = [];
    let currentExercise = null;
    let currentTemplateId = null;

    for (const row of exerciseData) {
      const [name, rest, setType, weight, reps, notes, supersetId, templateId] =
        row;
      const normalizedTemplateId = normalizeTemplateId(
        templateId,
        currentTemplateId,
        name
      );

      const parsedWeight = parseAndConvertWeight(weight, conversionFactor);
      const parsedReps = parseRepRange(reps);
      const templateType = templateTypeMap[normalizedTemplateId];

      if (normalizedTemplateId !== currentTemplateId) {
        if (currentExercise) {
          exercises.push(currentExercise);
        }
        currentExercise = createNewExercise(
          normalizedTemplateId,
          parseNumber(rest, "rest"),
          parseNumber(supersetId, "superset ID"),
          normalizeNotes(notes)
        );
        currentTemplateId = normalizedTemplateId;
      }

      if (currentExercise) {
        currentExercise.sets.push(
          createSet(
            setType,
            parsedWeight,
            parsedReps.reps,
            parsedReps.rep_range,
            templateType
          )
        );
      }
    }

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
 * Builds a map of template IDs to exercise types from the Exercises sheet
 * @returns {Object<string, string>} Map of template ID to exercise type
 * @throws {SheetError} If Exercises sheet is not found
 */
function buildTemplateTypeMap() {
  const ss = getActiveSpreadsheet();
  const exercisesSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);

  if (!exercisesSheet) {
    throw new SheetError(
      `Sheet "${EXERCISES_SHEET_NAME}" not found`,
      EXERCISES_SHEET_NAME,
      { operation: "Building template type map" }
    );
  }

  const exerciseValues = exercisesSheet.getDataRange().getValues();
  const headersRow = exerciseValues.shift();
  const idCol = headersRow.indexOf("ID");
  const typeCol = headersRow.indexOf("Type");
  const templateTypeMap = {};

  for (const row of exerciseValues) {
    const id = String(row[idCol]).trim();
    if (id) {
      templateTypeMap[id] = row[typeCol];
    }
  }

  return templateTypeMap;
}

/**
 * Gets the weight conversion factor based on the unit set in the Main sheet
 * @returns {number} Conversion factor to convert to kg
 * @throws {SheetError} If Main sheet is not found
 */
function getWeightConversionFactor() {
  const ss = getActiveSpreadsheet();
  const mainSheet = ss.getSheetByName(MAIN_SHEET_NAME);

  if (!mainSheet) {
    throw new SheetError(
      `Sheet "${MAIN_SHEET_NAME}" not found`,
      MAIN_SHEET_NAME,
      { operation: "Getting weight unit" }
    );
  }

  const weightUnit =
    mainSheet.getRange(WEIGHT_UNIT_CELL).getValue() || DEFAULT_WEIGHT_UNIT;
  const conversionFactors = {
    lbs: WEIGHT_CONVERSION.LBS_TO_KG,
    stone: WEIGHT_CONVERSION.STONE_TO_KG,
    kg: 1,
  };

  return conversionFactors[weightUnit] || 1;
}

/**
 * Normalizes template ID, carrying forward from previous row if empty
 * @param {*} templateId - Template ID from current row
 * @param {string|null} currentTemplateId - Template ID from previous row
 * @param {string} exerciseName - Exercise name for error messages
 * @returns {string} Normalized template ID
 * @throws {ValidationError} If template ID is missing and no previous ID exists
 */
function normalizeTemplateId(templateId, currentTemplateId, exerciseName) {
  const trimmedId = templateId ? String(templateId).trim() : "";

  if (!trimmedId) {
    if (!currentTemplateId) {
      throw new ValidationError(
        `Missing template ID for exercise: ${exerciseName}`
      );
    }
    return currentTemplateId;
  }

  return trimmedId;
}

/**
 * Parses weight value and converts to kg
 * @param {*} weight - Weight value from sheet
 * @param {number} conversionFactor - Factor to convert to kg
 * @returns {number|null} Weight in kg or null
 */
function parseAndConvertWeight(weight, conversionFactor) {
  const parsedWeight = parseNumber(weight, "weight");
  return parsedWeight !== null ? parsedWeight * conversionFactor : null;
}

/**
 * Normalizes notes value, returning null if empty
 * @param {*} notes - Notes value from sheet
 * @returns {string|null} Trimmed notes or null
 */
function normalizeNotes(notes) {
  if (!notes) return null;
  const trimmed = String(notes).trim();
  return trimmed !== "" ? trimmed : null;
}

/**
 * Creates a new exercise object
 * @param {string} templateId - Exercise template ID
 * @param {number|null} rest - Rest period in seconds
 * @param {number|null} supersetId - Superset ID if applicable
 * @param {string|null} notes - Exercise notes
 * @returns {RoutineExercise} New exercise object
 */
function createNewExercise(templateId, rest, supersetId, notes) {
  return {
    exercise_template_id: templateId,
    superset_id: supersetId || null,
    notes: notes || null,
    rest_seconds: rest,
    sets: [],
  };
}

/**
 * Creates a set object from processed values
 * @param {string} setType - Set type (e.g., "normal")
 * @param {number|null} weight - Weight in kg
 * @param {number|null} reps - Number of reps
 * @param {Object|null} repRange - Rep range object with start and end
 * @param {string|null} templateType - Exercise template type
 * @returns {RoutineSet} New set object
 */
function createSet(setType, weight, reps, repRange, templateType) {
  const normalizedType = String(templateType || "").toLowerCase();
  const isDurationType = normalizedType.includes("duration");
  const isDistanceType = normalizedType.includes("distance");

  const set = {
    type: setType || "normal",
  };

  // Handle weight/duration based on exercise type
  if (isDurationType) {
    if (weight != null) {
      set.duration_seconds = weight;
    }
  } else {
    if (weight != null) {
      set.weight_kg = weight;
    }
  }

  // Handle reps/rep_range/distance based on exercise type
  if (isDistanceType) {
    if (reps != null) {
      set.distance_meters = reps;
    }
  } else if (isValidRepRange(repRange)) {
    set.rep_range = { start: repRange.start, end: repRange.end };
  } else if (reps != null) {
    set.reps = reps;
  }

  return set;
}

/**
 * Checks if repRange is a valid object with start and end properties
 * @param {*} repRange - Value to check
 * @returns {boolean} True if valid rep range object
 */
function isValidRepRange(repRange) {
  return (
    repRange &&
    typeof repRange === "object" &&
    repRange.start != null &&
    repRange.end != null
  );
}

/**
 * Validates the routine data before submission
 * @param {string} title - Routine title to validate
 * @param {Array<RoutineExercise>} exercises - Array of exercises to validate
 * @throws {ValidationError} If validation fails with detailed error messages
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
      const exerciseNum = index + 1;

      if (!exercise.exercise_template_id) {
        errors.push(
          `Exercise at position ${exerciseNum} is missing a template ID`
        );
      }

      if (!exercise.sets || exercise.sets.length === 0) {
        errors.push(
          `Exercise at position ${exerciseNum} requires at least one set`
        );
      }

      exercise.sets?.forEach((set, setIndex) => {
        if (!set.type) {
          errors.push(
            `Set ${setIndex + 1} of exercise ${exerciseNum} is missing a type`
          );
        }
      });
    });
  }

  if (errors.length > 0) {
    throw new ValidationError(`Validation failed:\n${errors.join("\n")}`);
  }
}
