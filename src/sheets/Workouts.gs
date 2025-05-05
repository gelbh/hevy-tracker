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
  const props = PropertiesService.getScriptProperties();
  const lastUpdate = props.getProperty("LAST_WORKOUT_UPDATE");

  const isFirstRun = !lastUpdate || !sheet.getRange("A2").getValue();
  if (isFirstRun) {
    await importAllWorkoutsFull();
  } else {
    await importAllWorkoutsDelta(lastUpdate);
  }

  await updateExerciseCounts(
    SheetManager.getOrCreate(EXERCISES_SHEET_NAME).sheet
  );
  manager.formatSheet();
}

/**
 * Performs a full import of all workouts.
 * Clears existing data rows (keeping headers), fetches all pages,
 * and writes rows in a single batch.
 */
async function importAllWorkoutsFull() {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const sheet = manager.sheet;
  const props = PropertiesService.getScriptProperties();

  props.deleteProperty("LAST_WORKOUT_UPDATE");

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

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

  props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Imported ${rows.length} workout records.`,
    "Full Import Complete",
    5
  );
}

/**
 * Imports only changed/deleted workouts since lastUpdate.
 * @param {string} lastUpdate ISO timestamp
 */
async function importAllWorkoutsDelta(lastUpdate) {
  const manager = SheetManager.getOrCreate(WORKOUTS_SHEET_NAME);
  const sheet = manager.sheet;
  const props = PropertiesService.getScriptProperties();

  const processed = [];
  const deletedIds = new Set();

  await apiClient.fetchPaginatedData(
    API_ENDPOINTS.WORKOUTS_EVENTS,
    PAGE_SIZE.WORKOUTS,
    (events) => {
      events.forEach((e) => {
        if (e.type === "updated" || e.type === "created")
          processed.push(e.workout);
        else if (e.type === "deleted") deletedIds.add(e.id);
      });
    },
    "events",
    { since: lastUpdate }
  );

  if (deletedIds.size) deleteWorkoutRows(sheet, deletedIds);

  if (processed.length) {
    const rows = processWorkoutsData(processed);
    updateWorkoutData(sheet, rows);
    props.setProperty("LAST_WORKOUT_UPDATE", new Date().toISOString());
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Processed ${processed.length} workout changes.`,
      "Delta Import Complete",
      5
    );
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "No workout changes to apply.",
      "Delta Import",
      5
    );
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
          normalizeSetType(set.type),
          normalizeWeight(set.weight_kg),
          normalizeNumber(set.reps),
          normalizeNumber(set.distance_meters),
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
