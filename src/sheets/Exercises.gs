/**
 * Functions for importing and managing exercise data.
 */

/**
 * Imports all exercises from Hevy API and populates the 'Exercises' sheet.
 * Only adds new exercises while preserving existing ones.
 * New exercises are added just before the last row and all exercises are sorted by count.
 * Exercise counts are always recalculated even if no new exercises are imported.
 */
async function importAllExercises() {
  try {
    const manager = SheetManager.getOrCreate(EXERCISES_SHEET_NAME);
    const sheet = manager.sheet;

    const existingData = getExistingExercises(sheet);
    const processedExercises = [];

    const processExercisePage = async (exercises) => {
      const newExercises = exercises.filter(
        (exercise) => !shouldSkipExercise(exercise, existingData)
      );

      const processedData = processExercisesData(newExercises);
      processedExercises.push(...processedData);
    };

    const totalExercises = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.EXERCISES,
      PAGE_SIZE.EXERCISES,
      processExercisePage,
      "exercise_templates"
    );

    let updateMessage = "";

    if (processedExercises.length > 0) {
      await insertNewExercises(sheet, processedExercises);
      updateMessage = `Imported ${processedExercises.length} new exercises. `;
    } else {
      updateMessage = "No new exercises found. ";
    }

    await updateExerciseCounts(sheet);

    manager.formatSheet();
    addDuplicateHighlighting(manager);

    showProgress(
      updateMessage + "Updated counts for all exercises!",
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing exercises",
      sheetName: EXERCISES_SHEET_NAME,
    });
  }
}

/**
 * Gets existing exercises from the sheet along with their details
 * @private
 */
function getExistingExercises(sheet) {
  try {
    const existingData = new Map();
    if (sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      const headers = data.shift();
      const indices = {
        id: headers.indexOf("ID"),
        title: headers.indexOf("Title"),
        rank: headers.indexOf("Rank"),
      };

      data.forEach((row) => {
        if (row[indices.title]) {
          existingData.set(row[indices.title].toLowerCase(), {
            id: row[indices.id],
            hasRank: row[indices.rank] !== "",
          });
        }
      });
    }
    return existingData;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting existing exercises",
      sheetName: sheet.getName(),
    });
  }
}

/**
 * Processes exercise data into a format suitable for the sheet
 * @param {Object[]} exercises - Array of exercise objects from API
 * @return {Array[]} Processed data ready for sheet insertion
 */
function processExercisesData(exercises) {
  try {
    return exercises.map((exercise) => [
      exercise.id,
      exercise.title,
      "", // IMG
      exercise.type || "",
      formatMuscleGroup(exercise.primary_muscle_group),
      formatMuscleGroups(exercise.secondary_muscle_groups),
      exercise.is_custom ? "TRUE" : "FALSE",
      0, // Count
      "", // Rank
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing exercise data",
      exerciseCount: exercises.length,
    });
  }
}

/**
 * Formats a primary muscle group name
 * @param {string} muscleGroup - Muscle group name to format
 * @return {string} Formatted muscle group name
 */
function formatMuscleGroup(muscleGroup) {
  if (!muscleGroup) return "";
  return muscleGroup
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Formats an array of secondary muscle groups
 * @param {string[]} muscleGroups - Array of muscle group names
 * @return {string} Formatted muscle groups string
 */
function formatMuscleGroups(muscleGroups) {
  if (!muscleGroups || !Array.isArray(muscleGroups)) return "";
  return muscleGroups
    .map((group) => formatMuscleGroup(group))
    .filter((group) => group)
    .join(", ");
}

/**
 * Determines if an exercise should be skipped based on existing data
 * @param {Object} exercise - Exercise object from API
 * @param {Map} existingData - Map of existing exercise data
 * @return {boolean} True if exercise should be skipped
 */
function shouldSkipExercise(exercise, existingData) {
  const titleKey = exercise.title.toLowerCase();
  const existingEntry = existingData.get(titleKey);

  if (existingEntry) {
    return true;
  }

  return false;
}

/**
 * Inserts new exercises into the sheet
 * @private
 */
async function insertNewExercises(sheet, processedExercises) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.insertRowsBefore(lastRow, processedExercises.length);
      const insertStartRow = lastRow;
      const range = sheet.getRange(
        insertStartRow,
        1,
        processedExercises.length,
        processedExercises[0].length
      );
      range.setValues(processedExercises);
    } else {
      const range = sheet.getRange(
        2,
        1,
        processedExercises.length,
        processedExercises[0].length
      );
      range.setValues(processedExercises);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Inserting new exercises",
      sheetName: sheet.getName(),
      exerciseCount: processedExercises.length,
    });
  }
}

/**
 * Updates exercise counts based on workout data using batched processing
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 */
async function updateExerciseCounts(exerciseSheet) {
  const workoutSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORKOUTS_SHEET_NAME);

  if (!workoutSheet) {
    return;
  }

  try {
    const workoutData = workoutSheet.getDataRange().getValues();
    const workoutHeaders = workoutData.shift();
    const indices = {
      workoutId: workoutHeaders.indexOf("ID"),
      exercise: workoutHeaders.indexOf("Exercise"),
    };

    const exerciseCounts = new Map();
    const processedWorkouts = new Set();

    const batchSize = 1000;

    for (let i = 0; i < workoutData.length; i += batchSize) {
      const batch = workoutData.slice(
        i,
        Math.min(i + batchSize, workoutData.length)
      );

      batch.forEach((row) => {
        const workoutId = row[indices.workoutId];
        const exerciseTitle = row[indices.exercise];

        if (exerciseTitle && workoutId) {
          const key = `${workoutId}_${exerciseTitle}`;

          if (!processedWorkouts.has(key)) {
            processedWorkouts.add(key);
            exerciseCounts.set(
              exerciseTitle,
              (exerciseCounts.get(exerciseTitle) || 0) + 1
            );
          }
        }
      });

      if (i % (batchSize * 5) === 0) {
        Utilities.sleep(RATE_LIMIT.API_DELAY);
      }
    }

    const exerciseData = exerciseSheet.getDataRange().getValues();
    const exerciseHeaders = exerciseData.shift();
    const titleIndex = exerciseHeaders.indexOf("Title");
    const countIndex = exerciseHeaders.indexOf("Count");

    for (let i = 0; i < exerciseData.length; i += batchSize) {
      const batch = exerciseData.slice(
        i,
        Math.min(i + batchSize, exerciseData.length)
      );
      const updateRange = exerciseSheet.getRange(
        i + 2,
        countIndex + 1,
        batch.length,
        1
      );

      const counts = batch.map((row) => [
        exerciseCounts.get(row[titleIndex]) || 0,
      ]);
      updateRange.setValues(counts);

      if (i % (batchSize * 5) === 0) {
        Utilities.sleep(RATE_LIMIT.API_DELAY);
      }
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating exercise counts",
      sheetName: exerciseSheet.getName(),
    });
  }
}

/**
 * Adds conditional formatting rule to highlight duplicate exercise names
 * @private
 */
function addDuplicateHighlighting(manager) {
  try {
    const sheet = manager.sheet;
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    const titleColumn =
      SHEET_HEADERS[EXERCISES_SHEET_NAME].indexOf("Title") + 1;
    if (titleColumn === 0) return;

    const range = sheet.getRange(2, titleColumn, lastRow - 1, 1);
    const rules = sheet.getConditionalFormatRules().filter((rule) => {
      try {
        const criteria = rule.getCriteriaType();
        return (
          criteria !== SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA ||
          !rule.getBooleanCriteria().getFormulas()[0].includes("countif")
        );
      } catch (e) {
        return true;
      }
    });

    const columnLetter = columnToLetter(titleColumn);
    const duplicateRule = SpreadsheetApp.newConditionalFormatRule()
      .setRanges([range])
      .whenFormulaSatisfied(
        `=countif($${columnLetter}$2:$${columnLetter}, $${columnLetter}2)>1`
      )
      .setBackground("#FFE6E6")
      .setFontColor("#B71C1C")
      .setBold(true)
      .build();

    rules.unshift(duplicateRule);
    sheet.setConditionalFormatRules(rules);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Adding duplicate highlighting",
      sheetName: manager.sheet.getName(),
    });
  }
}
