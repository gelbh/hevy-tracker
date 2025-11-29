/**
 * @typedef {Object} RoutineFolder
 * @property {number} id - Folder ID
 * @property {string} title - Folder name
 * @property {string} updated_at - Last update timestamp (ISO 8601)
 * @property {string} created_at - Creation timestamp (ISO 8601)
 * @property {number} index - Folder index for ordering
 */

/**
 * Functions for importing and managing routine folders.
 * @module RoutineFolders
 */

/**
 * Imports all workout routine folders from Hevy API
 * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
 * @returns {Promise<void>}
 */
async function importAllRoutineFolders(checkTimeout = null) {
  try {
    const manager = SheetManager.getOrCreate(ROUTINE_FOLDERS_SHEET_NAME);
    manager.clearSheet();

    const processedFolders = [];
    const processFolderPage = async (folders) => {
      const processedData = processFolderData(folders);
      processedFolders.push(...processedData);

      const ss = getActiveSpreadsheet();
      ss.toast(
        `Processed ${processedFolders.length} folders...`,
        "Processing Progress"
      );
    };

    const totalFolders = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      PAGE_SIZE.ROUTINE_FOLDERS,
      processFolderPage,
      "routine_folders",
      {},
      checkTimeout
    );

    await updateFoldersInSheet(manager.sheet, processedFolders);

    try {
      await manager.formatSheet(checkTimeout);
    } catch (error) {
      if (error instanceof ImportTimeoutError) {
        console.warn("formatSheet timed out during routine folder import");
      } else {
        throw error;
      }
    }

    const ss = getActiveSpreadsheet();
    ss.toast(
      `Imported ${totalFolders} folders successfully!`,
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    // Re-throw ImportTimeoutError
    if (error instanceof ImportTimeoutError) {
      throw error;
    }
    throw ErrorHandler.handle(error, {
      operation: "Importing routine folders",
      sheetName: ROUTINE_FOLDERS_SHEET_NAME,
    });
  }
}

/**
 * Processes folder data into the correct format
 * @private
 */
const processFolderData = (folders) => {
  try {
    return folders.map((folder) => [
      folder.id,
      folder.title,
      formatDate(folder.updated_at),
      formatDate(folder.created_at),
      folder.index,
    ]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing folder data",
      folderCount: folders?.length ?? 0,
    });
  }
};

/**
 * Updates the sheet with folder data in a single batch operation
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to update
 * @param {Array<Array>} processedFolders - Processed folder data
 * @private
 */
async function updateFoldersInSheet(sheet, processedFolders) {
  try {
    if (processedFolders.length === 0) {
      return;
    }

    const numCols = SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME].length;
    sheet
      .getRange(2, 1, processedFolders.length, numCols)
      .setValues(processedFolders);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating folders in sheet",
      sheetName: sheet.getName(),
      folderCount: processedFolders.length,
    });
  }
}
