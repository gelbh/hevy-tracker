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
 * Builds a map of workout IDs to row numbers by reading only the ID column
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to read from
 * @returns {Map<string, number>} Map of workout ID to row number
 * @private
 */
function _buildWorkoutIdRowMap(sheet) {
  const rowMap = new Map();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return rowMap;
  }

  const idColumn = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  idColumn.forEach((row, i) => {
    if (row[0]) {
      rowMap.set(row[0], i + 2);
    }
  });

  return rowMap;
}

/**
 * Groups contiguous row updates into segments for batch writing
 * @param {Array<{r: number, d: Array}>} updates - Array of update objects with row number and data
 * @returns {Array<{start: number, data: Array<Array>}>} Array of contiguous segments
 * @private
 */
function _groupContiguousUpdates(updates) {
  return updates
    .sort((a, b) => a.r - b.r)
    .reduce((segs, u) => {
      const last = segs[segs.length - 1];
      if (last && u.r === last.start + last.data.length) {
        last.data.push(u.d);
      } else {
        segs.push({ start: u.r, data: [u.d] });
      }
      return segs;
    }, []);
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

  const rowMap = _buildWorkoutIdRowMap(sheet);
  const updates = [];
  const additions = [];

  processedData.forEach((row) => {
    const id = row[0];
    if (rowMap.has(id)) {
      updates.push({ r: rowMap.get(id), d: row });
    } else {
      additions.push(row);
    }
  });

  const updateSegments = _groupContiguousUpdates(updates);
  updateSegments.forEach((seg) => {
    sheet
      .getRange(seg.start, 1, seg.data.length, seg.data[0].length)
      .setValues(seg.data);
  });

  if (additions.length > 0) {
    sheet.insertRowsBefore(2, additions.length);
    sheet
      .getRange(2, 1, additions.length, additions[0].length)
      .setValues(additions);
  }
}
