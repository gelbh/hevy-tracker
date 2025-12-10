/**
 * Sheet operations for workout data management.
 * Handles bulk updates, deletions, and upsert operations.
 * @module workouts/WorkoutSheetOps
 */

/**
 * Deletes workout rows from the sheet in a single bulk rewrite.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to modify
 * @param {Set<string>} workoutIds - Set of workout IDs to delete
 * @private
 */
function deleteWorkoutRows(sheet, workoutIds) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return;
  }

  const values = sheet.getDataRange().getValues();

  if (!values || values.length === 0) {
    return;
  }

  const headers = values[0];
  const idIdx = headers.indexOf("ID");

  if (idIdx === -1) {
    throw new SheetError("ID column not found in sheet", sheet.getName(), {
      headers: headers,
    });
  }

  const filtered = values.filter(
    (row, i) => i === 0 || !workoutIds.has(row[idIdx])
  );

  sheet.clearContents();

  if (filtered.length === 0) {
    return;
  }

  const numCols = filtered[0]?.length || headers.length;
  sheet.getRange(1, 1, filtered.length, numCols).setValues(filtered);
}

/**
 * Updates workout data in the sheet using contiguous block writes.
 * Handles both updates to existing rows and additions of new rows.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update
 * @param {Array<Array>} processedData - Array of row data to upsert
 * @private
 */
function updateWorkoutData(sheet, processedData) {
  if (!processedData || processedData.length === 0) {
    return;
  }

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
