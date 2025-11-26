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
    const allApiExercises = [];
    const processedExercises = [];

    const processExercisePage = async (exercises) => {
      allApiExercises.push(...exercises);

      const newExercises = exercises.filter(
        (exercise) => !shouldSkipExercise(exercise, existingData)
      );
      const processedData = processExercisesData(newExercises);
      processedExercises.push(...processedData);
    };

    await apiClient.fetchPaginatedData(
      API_ENDPOINTS.EXERCISES,
      PAGE_SIZE.EXERCISES,
      processExercisePage,
      "exercise_templates"
    );

    if (
      SpreadsheetApp.getActiveSpreadsheet().getId() !== TEMPLATE_SPREADSHEET_ID
    ) {
      syncCustomExerciseIds(sheet, allApiExercises);
    }

    let updateMessage = "";

    if (processedExercises.length > 0) {
      await insertNewExercises(sheet, processedExercises);
      updateMessage = `Imported ${processedExercises.length} new exercises. `;
    } else {
      updateMessage = "No new exercises found. ";
    }

    await updateExerciseCounts(sheet);

    manager.formatSheet();

    SpreadsheetApp.getActiveSpreadsheet().toast(
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
 * Syncs IDs for any custom exercises in the sheet.
 * For each row where "Is Custom" is TRUE:
 *  • if an API exercise with the same title exists, set the ID to its API ID
 *  • otherwise set the ID to "N/A"
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet The Exercises sheet
 * @param {{id:string,title:string}[]} apiExercises Array of all exercises from the API
 */
function syncCustomExerciseIds(sheet, apiExercises) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idCol = headers.indexOf("ID") + 1;
  const titleCol = headers.indexOf("Title") + 1;

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1 || lastColumn === 0) return;

  const data = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  const newIds = data.map((row) => {
    const match = apiExercises.find(
      (ex) => ex.title.toLowerCase() === String(row[titleCol - 1]).toLowerCase()
    );
    return [match ? match.id : "N/A"];
  });

  sheet.getRange(2, idCol, newIds.length, 1).setValues(newIds);
}

/**
 * Gets existing exercises from the sheet along with their details
 * @private
 */
function getExistingExercises(sheet) {
  try {
    const existingDataById = new Map();
    const existingDataByTitle = new Map();
    if (sheet.getLastRow() > 1) {
      const data = sheet.getDataRange().getValues();
      const headers = data.shift();
      const indices = {
        id: headers.indexOf("ID"),
        title: headers.indexOf("Title"),
        rank: headers.indexOf("Rank"),
      };

      data.forEach((row) => {
        const id = String(row[indices.id] || "").trim();
        const title = String(row[indices.title] || "").trim();
        const hasRank = row[indices.rank] !== "";

        if (id && id !== "N/A") {
          existingDataById.set(id, {
            id: id,
            title: title,
            hasRank: hasRank,
          });
        }
        if (title) {
          existingDataByTitle.set(title.toLowerCase(), {
            id: id,
            title: title,
            hasRank: hasRank,
          });
        }
      });
    }
    return {
      byId: existingDataById,
      byTitle: existingDataByTitle,
    };
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
    const isTemplate =
      SpreadsheetApp.getActiveSpreadsheet().getId() === TEMPLATE_SPREADSHEET_ID;
    return exercises.map((exercise) => [
      isTemplate ? "" : exercise.id,
      exercise.title,
      "", // IMG
      exercise.type || "",
      toTitleCaseFromSnake(exercise.primary_muscle_group),
      arrayToTitleCase(exercise.secondary_muscle_groups),
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
 * Determines if an exercise should be skipped based on existing data.
 * Checks by ID first, then by title (with English translation fallback).
 * @param {Object} exercise - Exercise object from API
 * @param {Object} existingData - Object with byId and byTitle Maps
 * @return {boolean} True if exercise should be skipped
 */
function shouldSkipExercise(exercise, existingData) {
  // Check by ID first (most reliable)
  if (exercise.id && existingData.byId.has(exercise.id)) {
    return true;
  }

  // Check by title (exact match)
  const titleKey = exercise.title.toLowerCase();
  if (existingData.byTitle.has(titleKey)) {
    return true;
  }

  // Check by English translation (fallback)
  const englishTitle = getEnglishName(exercise.title);
  if (englishTitle !== exercise.title) {
    const englishTitleKey = englishTitle.toLowerCase();
    if (existingData.byTitle.has(englishTitleKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Appends new exercises at the end of the sheet.
 * @private
 */
async function insertNewExercises(sheet, processedExercises) {
  try {
    const startRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(
      startRow,
      1,
      processedExercises.length,
      processedExercises[0].length
    );
    range.setValues(processedExercises);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Appending new exercises",
      sheetName: sheet.getName(),
      exerciseCount: processedExercises.length,
    });
  }
}

/**
 * Updates exercise counts based on workout data using batched processing.
 * Matches exercises by exercise_template_id first, then falls back to title matching.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} exerciseSheet - The exercise sheet
 */
async function updateExerciseCounts(exerciseSheet) {
  const workoutSheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORKOUTS_SHEET_NAME);

  if (!workoutSheet) {
    return;
  }

  try {
    // Build maps from exercise sheet: ID -> title, title -> count
    const exerciseData = exerciseSheet.getDataRange().getValues();
    const exerciseHeaders = exerciseData.shift();
    const idIndex = exerciseHeaders.indexOf("ID");
    const titleIndex = exerciseHeaders.indexOf("Title");
    const countIndex = exerciseHeaders.indexOf("Count");

    const idToTitleMap = new Map();
    const titleToIdMap = new Map();
    exerciseData.forEach((row) => {
      const id = String(row[idIndex] || "").trim();
      const title = String(row[titleIndex] || "").trim();
      if (id && id !== "N/A") {
        idToTitleMap.set(id, title);
      }
      if (title) {
        titleToIdMap.set(title.toLowerCase(), id);
      }
    });

    // Process workout data
    const workoutData = workoutSheet.getDataRange().getValues();
    const workoutHeaders = workoutData.shift();
    const indices = {
      workoutId: workoutHeaders.indexOf("ID"),
      exercise: workoutHeaders.indexOf("Exercise"),
      exerciseTemplateId: workoutHeaders.indexOf("Exercise Template ID"),
    };

    // Count exercises by ID first, then by title (with English translation fallback)
    const exerciseCountsById = new Map();
    const exerciseCountsByTitle = new Map();
    const processedWorkouts = new Set();

    const batchSize = 1000;

    for (let i = 0; i < workoutData.length; i += batchSize) {
      const batch = workoutData.slice(
        i,
        Math.min(i + batchSize, workoutData.length)
      );

      batch.forEach((row) => {
        const workoutId = row[indices.workoutId];
        const exerciseTitle = String(row[indices.exercise] || "").trim();
        const exerciseTemplateId = String(
          row[indices.exerciseTemplateId] || ""
        ).trim();

        if (exerciseTitle && workoutId) {
          const key = `${workoutId}_${exerciseTemplateId || exerciseTitle}`;

          if (!processedWorkouts.has(key)) {
            processedWorkouts.add(key);

            // Try matching by ID first
            if (exerciseTemplateId && idToTitleMap.has(exerciseTemplateId)) {
              const matchedTitle = idToTitleMap.get(exerciseTemplateId);
              exerciseCountsById.set(
                exerciseTemplateId,
                (exerciseCountsById.get(exerciseTemplateId) || 0) + 1
              );
            } else {
              // Fallback to title matching (with English translation)
              const englishTitle = getEnglishName(exerciseTitle);
              const titleKey = exerciseTitle.toLowerCase();
              const englishTitleKey = englishTitle.toLowerCase();

              // Try exact match first
              if (titleToIdMap.has(titleKey)) {
                exerciseCountsByTitle.set(
                  exerciseTitle,
                  (exerciseCountsByTitle.get(exerciseTitle) || 0) + 1
                );
              } else if (
                englishTitle !== exerciseTitle &&
                titleToIdMap.has(englishTitleKey)
              ) {
                // Try English translation
                exerciseCountsByTitle.set(
                  englishTitle,
                  (exerciseCountsByTitle.get(englishTitle) || 0) + 1
                );
              } else {
                // No match found, count by original title
                exerciseCountsByTitle.set(
                  exerciseTitle,
                  (exerciseCountsByTitle.get(exerciseTitle) || 0) + 1
                );
              }
            }
          }
        }
      });

      if (i % (batchSize * 5) === 0) {
        Utilities.sleep(RATE_LIMIT.API_DELAY);
      }
    }

    // Update counts in exercise sheet
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

      const counts = batch.map((row) => {
        const id = String(row[idIndex] || "").trim();
        const title = String(row[titleIndex] || "").trim();
        let count = 0;

        // Check ID-based count first
        if (id && id !== "N/A" && exerciseCountsById.has(id)) {
          count = exerciseCountsById.get(id);
        } else if (title) {
          // Check title-based count (exact match)
          if (exerciseCountsByTitle.has(title)) {
            count = exerciseCountsByTitle.get(title);
          } else {
            // Check English translation match
            const englishTitle = getEnglishName(title);
            if (
              englishTitle !== title &&
              exerciseCountsByTitle.has(englishTitle)
            ) {
              count = exerciseCountsByTitle.get(englishTitle);
            }
          }
        }

        return [count];
      });
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
 * Syncs localized exercise names across all sheets.
 * First updates Exercises sheet with localized names from workouts (by ID).
 * Then scans all sheets and replaces hardcoded exercise names (non-formula) with localized names.
 */
async function syncLocalizedExerciseNames() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const workoutSheet = ss.getSheetByName(WORKOUTS_SHEET_NAME);
  const exerciseSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);

  if (!workoutSheet || workoutSheet.getLastRow() <= 1) {
    return;
  }

  if (!exerciseSheet || exerciseSheet.getLastRow() <= 1) {
    return;
  }

  try {
    // Step 1: Build map of exercise_template_id -> localized name from workouts
    const workoutData = workoutSheet.getDataRange().getValues();
    const workoutHeaders = workoutData.shift();
    const exerciseTemplateIdIndex = workoutHeaders.indexOf(
      "Exercise Template ID"
    );
    const exerciseTitleIndex = workoutHeaders.indexOf("Exercise");

    if (exerciseTemplateIdIndex === -1 || exerciseTitleIndex === -1) {
      return; // Columns don't exist yet
    }

    const idToLocalizedName = new Map();
    // Also build a map of all exercise names seen in workouts (for fallback matching)
    const workoutExerciseNames = new Set();

    workoutData.forEach((row) => {
      const exerciseTemplateId = String(
        row[exerciseTemplateIdIndex] || ""
      ).trim();
      const localizedTitle = String(row[exerciseTitleIndex] || "").trim();

      if (
        exerciseTemplateId &&
        localizedTitle &&
        exerciseTemplateId !== "N/A"
      ) {
        idToLocalizedName.set(exerciseTemplateId, localizedTitle);
        workoutExerciseNames.add(localizedTitle.toLowerCase());
      }
    });

    if (idToLocalizedName.size === 0) {
      return; // No exercises to sync
    }

    // Step 2: Build map of exercise names BEFORE updating Exercises sheet
    // This ensures we capture English names that might be in other sheets
    const exerciseData = exerciseSheet.getDataRange().getValues();
    const exerciseHeaders = exerciseData.shift();
    const idIndex = exerciseHeaders.indexOf("ID");
    const titleIndex = exerciseHeaders.indexOf("Title");

    if (idIndex === -1 || titleIndex === -1) {
      return;
    }

    // Build map: any exercise name (English or localized) -> localized name
    // Include both current title (might be English) and localized name
    const exerciseNameToLocalized = new Map();
    const exerciseUpdates = [];

    exerciseData.forEach((row, rowIndex) => {
      const exerciseId = String(row[idIndex] || "").trim();
      const currentTitle = String(row[titleIndex] || "").trim();

      if (
        exerciseId &&
        exerciseId !== "N/A" &&
        idToLocalizedName.has(exerciseId)
      ) {
        const localizedName = idToLocalizedName.get(exerciseId);

        // Map current title (English) to localized name
        if (currentTitle) {
          exerciseNameToLocalized.set(
            currentTitle.toLowerCase(),
            localizedName
          );
        }
        // Also map localized name to itself (for consistency)
        exerciseNameToLocalized.set(localizedName.toLowerCase(), localizedName);

        // Track update for Exercises sheet if name is different
        if (localizedName !== currentTitle) {
          exerciseUpdates.push({
            row: rowIndex + 2, // +2 for header and 0-index
            value: localizedName,
          });
        }
      } else if (currentTitle) {
        // For exercises not in workouts, map name to itself
        exerciseNameToLocalized.set(currentTitle.toLowerCase(), currentTitle);
      }
    });

    // Update Exercises sheet with localized names
    if (exerciseUpdates.length > 0) {
      exerciseUpdates.forEach((update) => {
        exerciseSheet
          .getRange(update.row, titleIndex + 1)
          .setValue(update.value);
      });
    }

    // Step 3: Also build reverse map from Exercises sheet: ID -> all possible names
    // This helps us match exercises by any name variation
    const idToAllNames = new Map();
    exerciseData.forEach((row) => {
      const exerciseId = String(row[idIndex] || "").trim();
      const currentTitle = String(row[titleIndex] || "").trim();

      if (exerciseId && exerciseId !== "N/A" && currentTitle) {
        if (!idToAllNames.has(exerciseId)) {
          idToAllNames.set(exerciseId, new Set());
        }
        idToAllNames.get(exerciseId).add(currentTitle.toLowerCase());

        // If we have a localized name for this ID, add it too
        if (idToLocalizedName.has(exerciseId)) {
          const localized = idToLocalizedName.get(exerciseId);
          idToAllNames.get(exerciseId).add(localized.toLowerCase());
        }
      }
    });

    // Step 4: Scan all sheets and replace hardcoded exercise names
    const allSheets = ss.getSheets();
    const batchSize = 100;

    for (const sheet of allSheets) {
      // Skip if sheet is empty
      if (sheet.getLastRow() <= 1 || sheet.getLastColumn() === 0) {
        continue;
      }

      const dataRange = sheet.getDataRange();
      const numRows = dataRange.getNumRows();
      const numCols = dataRange.getNumColumns();

      // Process in batches to avoid memory issues
      for (let startRow = 1; startRow <= numRows; startRow += batchSize) {
        const endRow = Math.min(startRow + batchSize - 1, numRows);
        const range = sheet.getRange(
          startRow,
          1,
          endRow - startRow + 1,
          numCols
        );
        const values = range.getValues();
        const formulas = range.getFormulas();

        const updates = [];
        for (let r = 0; r < values.length; r++) {
          const actualRow = startRow + r;
          for (let c = 0; c < numCols; c++) {
            const cellValue = values[r][c];
            const cellFormula = formulas[r][c];

            // Skip if cell contains a formula
            if (cellFormula && cellFormula.trim() !== "") {
              continue;
            }

            // Skip if cell is empty
            if (!cellValue || String(cellValue).trim() === "") {
              continue;
            }

            const cellText = String(cellValue).trim();
            const cellKey = cellText.toLowerCase();

            // Check if this looks like an exercise name and we have a localized version
            let localizedName = null;

            // First, try direct lookup in our map
            if (exerciseNameToLocalized.has(cellKey)) {
              localizedName = exerciseNameToLocalized.get(cellKey);
            } else {
              // Try English translation fallback
              const englishName = getEnglishName(cellText);
              if (englishName !== cellText) {
                const englishKey = englishName.toLowerCase();
                if (exerciseNameToLocalized.has(englishKey)) {
                  localizedName = exerciseNameToLocalized.get(englishKey);
                }
              }

              // Also check if this name appears in any exercise's name set
              // and get the localized version for that exercise
              if (!localizedName) {
                for (const [exerciseId, names] of idToAllNames.entries()) {
                  if (names.has(cellKey) && idToLocalizedName.has(exerciseId)) {
                    localizedName = idToLocalizedName.get(exerciseId);
                    break;
                  }
                }
              }

              // Final fallback: check if this name is already a localized name from workouts
              if (!localizedName && workoutExerciseNames.has(cellKey)) {
                // Find the localized name for this exact match
                for (const [
                  exerciseId,
                  localized,
                ] of idToLocalizedName.entries()) {
                  if (localized.toLowerCase() === cellKey) {
                    localizedName = localized;
                    break;
                  }
                }
              }
            }

            // Update if we found a localized name and it's different
            if (localizedName && localizedName !== cellText) {
              updates.push({
                row: actualRow,
                col: c + 1,
                value: localizedName,
              });
            }
          }
        }

        // Apply updates
        if (updates.length > 0) {
          updates.forEach((update) => {
            sheet.getRange(update.row, update.col).setValue(update.value);
          });
        }

        if (startRow % (batchSize * 10) === 0) {
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      }
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Syncing localized exercise names across all sheets",
    });
  }
}
