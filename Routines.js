/**
 * Functions for importing and managing workout routines.
 */

/**
 * Imports all workout routines from Hevy API into the Routines sheet.
 */
async function importAllRoutines() {
  try {
    const manager = SheetManager.getOrCreate(ROUTINES_SHEET_NAME);
    const sheet = manager.sheet;
    
    const processedRoutines = [];
    const processRoutinePage = async (routines) => {
      const routineData = routines.flatMap(routine => processRoutine(routine));
      processedRoutines.push(...routineData);
      
      showProgress(
        `Processed ${processedRoutines.length} routine entries...`,
        'Processing Progress'
      );
    };
    
    const totalRoutines = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.ROUTINES,
      PAGE_SIZE.ROUTINES,
      processRoutinePage,
      'routines'
    );
    
    if (processedRoutines.length > 0) {
      const batchSize = RATE_LIMIT.BATCH_SIZE;
      for (let i = 0; i < processedRoutines.length; i += batchSize) {
        const batch = processedRoutines.slice(i, i + batchSize);
        const startRow = i + 2;
        
        sheet.getRange(startRow, 1, batch.length, batch[0].length)
             .setValues(batch);
        
        if (i % (batchSize * 5) === 0) {
          Utilities.sleep(RATE_LIMIT.API_DELAY);
        }
      }
      
      showProgress(
        `Imported ${totalRoutines} routines with ${processedRoutines.length} total entries!`,
        'Import Complete',
        TOAST_DURATION.NORMAL
      );
    } else {
      showProgress('No routine entries found to import.', 'Import Complete', TOAST_DURATION.NORMAL);
    }
  
    manager.formatSheet();
  } catch (error) {
    handleError(error, 'Importing routines');
  }
}

/**
 * Processes routines data into a format suitable for sheet insertion
 */
function processRoutine(routine) {
  if (!routine.exercises || routine.exercises.length === 0) {
    return [[
      routine.id,
      routine.title,
      assignRoutineFolder(routine),
      '',  // Exercise
      '',  // Set Type
      '',  // Weight
      ''   // Reps
    ]];
  }

  return routine.exercises.flatMap(exercise => 
    processRoutineExercise(exercise, routine)
  );
}

/**
 * Processes a single exercise within a routine
 */
function processRoutineExercise(exercise, routine) {
  return exercise.sets.map(set => [
    routine.id,
    routine.title,
    assignRoutineFolder(routine),
    exercise.title,
    set.set_type || '',
    normalizeWeight(set.weight_kg),
    normalizeNumber(set.reps)
  ]);
}

/**
 * Assigns a routine folder based on routine properties
 */
function assignRoutineFolder(routine) {
  if (routine.folder_id != null) {
    return routine.folder_id;
  }
  
  const title = routine.title.toLowerCase();
  if (title.includes("push") || title.includes("pull")) {
    return '111111'; // Coach folder ID
  }
  
  return '';
}