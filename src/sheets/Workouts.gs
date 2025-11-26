/**
 * Functions for importing and managing workout data.
 * Requires shared constants and utilities defined elsewhere.
 */

/**
 * Synchronizes workout data to the 'Workouts' sheet.
 * - First run: full import of all workouts.
 * - Subsequent runs: delta import of only new/changed/deleted events.
 */
async function importAllWorkouts() {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const sheet = manager.sheet;

  const properties = getDocumentProperties();
  const lastUpdate = !sheet.getRange("A2").getValue()
    ? false
    : properties && properties.getProperty("LAST_WORKOUT_UPDATE");

  let changes = 0;
  if (!lastUpdate) {
    changes = await importAllWorkoutsFull();
  } else {
    changes = await importAllWorkoutsDelta(lastUpdate);
  }

  if (changes > 0) {
    const exerciseSheet = SheetManager.getOrCreate(EXERCISES_SHEET_NAME).sheet;
    await updateExerciseCounts(exerciseSheet);
    await syncLocalizedExerciseNames();
    manager.formatSheet();
  }
  return changes;
}

/**
 * Performs a full import of all workouts.
 * Clears existing data rows (keeping headers), fetches all pages,
 * and writes rows in a single batch.
 */
async function importAllWorkoutsFull() {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const sheet = manager.sheet;
  const props = getDocumentProperties();

  if (props) {
    props.deleteProperty("LAST_WORKOUT_UPDATE");
  }

  manager.clearSheet();

  const allWorkouts = [];
  await apiClient.fetchPaginatedData(
    API_ENDPOINTS.WORKOUTS,
    PAGE_SIZE.WORKOUTS,
    (workouts) => {
      if (workouts) allWorkouts.push(...workouts);
    },
    "workouts",
    {}
  );

  const rows = processWorkoutsData(allWorkouts);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  if (props) {
    props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
  }
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Imported ${rows.length} workout records.`,
    "Full Import Complete",
    TOAST_DURATION.NORMAL
  );
  return rows.length;
}

/**
 * Imports only changed or new workouts since lastUpdate.
 * Fetches full workout details for every upsert event to ensure exercise/sets data.
 *
 * @param {string} lastUpdate ISO timestamp of last import
 */
async function importAllWorkoutsDelta(lastUpdate) {
  try {
    const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
    const sheet = manager.sheet;
    const props = getDocumentProperties();
    if (!props) {
      throw new ConfigurationError(
        "Unable to access document properties. Please ensure you have proper permissions."
      );
    }

    const events = [];
    await apiClient.fetchPaginatedData(
      API_ENDPOINTS.WORKOUTS_EVENTS,
      PAGE_SIZE.WORKOUTS,
      (page) => events.push(...page),
      "events",
      { since: lastUpdate }
    );

    if (!events.length) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        "No new workout events found since last import.",
        "Delta Import Complete",
        TOAST_DURATION.NORMAL
      );
      return 0;
    }

    const deletedIds = new Set();
    const upsertIds = [];
    events.forEach((e) => {
      if (e.type === "deleted") {
        const id = e.workout?.id || e.id;
        if (id) deletedIds.add(id);
      } else if (e.type === "updated" || e.type === "created") {
        const id = e.workout?.id;
        if (id) upsertIds.push(id);
      }
    });

    if (deletedIds.size) {
      deleteWorkoutRows(sheet, deletedIds);
    }

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
    const fullWorkouts = await Promise.all(
      upsertIds.map(async (id) => {
        const resp = await apiClient.makeRequest(
          `${API_ENDPOINTS.WORKOUTS}/${id}`,
          apiClient.createRequestOptions(apiKey)
        );
        return resp.workout || resp;
      })
    );

    const rows = processWorkoutsData(fullWorkouts);
    updateWorkoutData(sheet, rows);

    if (props) {
      props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
    }
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Imported ${rows.length} workout records.`,
      "Delta Import Complete",
      TOAST_DURATION.NORMAL
    );
    return fullWorkouts.length;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing workout delta",
      sheetName: WORKOUTS_SHEET_NAME,
    });
  }
}

/**
 * Deletes workout rows from the sheet in a single bulk rewrite.
 * @private
 */
function deleteWorkoutRows(sheet, workoutIds) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf("ID");

  const filtered = values.filter(
    (row, i) => i === 0 || !workoutIds.has(row[idIdx])
  );
  sheet.clearContents();
  sheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
}

/**
 * Updates workout data in the sheet using contiguous block writes.
 * @private
 */
function updateWorkoutData(sheet, processedData) {
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const idIdx = headers.indexOf("ID");
  const rowMap = new Map(values.map((r, i) => [r[idIdx], i + 2]));

  const updates = [];
  const additions = [];

  processedData.forEach((row) => {
    const id = row[0];
    if (rowMap.has(id)) updates.push({ r: rowMap.get(id), d: row });
    else additions.push(row);
  });

  updates
    .sort((a, b) => a.r - b.r)
    .reduce((segs, u) => {
      const last = segs[segs.length - 1];
      if (last && u.r === last.start + last.data.length) last.data.push(u.d);
      else segs.push({ start: u.r, data: [u.d] });
      return segs;
    }, [])
    .forEach((seg) => {
      sheet
        .getRange(seg.start, 1, seg.data.length, seg.data[0].length)
        .setValues(seg.data);
    });

  if (additions.length) {
    sheet.insertRowsBefore(2, additions.length);
    sheet
      .getRange(2, 1, additions.length, additions[0].length)
      .setValues(additions);
  }
}

/**
 * Converts workout objects into 2D array of sheet rows.
 * @private
 */
function processWorkoutsData(workouts) {
  try {
    return workouts.flatMap((w) => {
      if (!w.exercises || !w.exercises.length) {
        return [
          [
            w.id,
            w.title,
            formatDate(w.start_time),
            formatDate(w.end_time),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
          ],
        ];
      }
      return w.exercises.flatMap((ex) =>
        ex.sets.map((set) => [
          w.id,
          w.title,
          formatDate(w.start_time),
          formatDate(w.end_time),
          ex.title,
          ex.exercise_template_id || "",
          normalizeSetType(set.type),
          normalizeWeight(set.weight_kg),
          normalizeNumber(set.reps ?? set.distance_meters),
          normalizeNumber(set.duration_seconds),
          normalizeNumber(set.rpe),
        ])
      );
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing workout data",
      workoutCount: workouts.length,
    });
  }
}
