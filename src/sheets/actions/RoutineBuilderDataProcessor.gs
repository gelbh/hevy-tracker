/**
 * Data transformation utilities for converting between sheet format and API format.
 * @module actions/RoutineBuilderDataProcessor
 */

/**
 * Processes exercise data from sheet into API format
 * @param {Array<Array>} exerciseData - Raw exercise data from sheet
 * @returns {Array<RoutineExercise>} Processed exercises in API format
 */
function processExercises(exerciseData) {
  try {
    const ss = getActiveSpreadsheet();
    const exercisesSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);
    if (!exercisesSheet) {
      throw new SheetError(
        `Sheet "${EXERCISES_SHEET_NAME}" not found`,
        EXERCISES_SHEET_NAME,
        {
          operation: "Processing exercises",
        }
      );
    }
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

    const mainSheet = ss.getSheetByName("Main");
    if (!mainSheet) {
      throw new SheetError('Sheet "Main" not found', "Main", {
        operation: "Getting weight unit",
      });
    }
    const weightUnit = mainSheet.getRange("I5").getValue() || "kg";

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
    notes: notes?.toString().trim() || null,
    rest_seconds: rest,
    sets: [],
  };
}

/**
 * Creates a set object from processed values
 * @param {string} setType - Set type (e.g., "normal")
 * @param {number|null} weight - Weight in kg
 * @param {number|null} reps - Number of reps
 * @param {string|null} templateType - Exercise template type
 * @returns {RoutineSet} New set object
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
