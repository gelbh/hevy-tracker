/**
 * Functions for importing and managing routine folders.
 */

/**
 * Imports all workout routine folders from Hevy API.
 */
async function importAllRoutineFolders() {
  try {
    const manager = SheetManager.getOrCreate(ROUTINE_FOLDERS_SHEET_NAME);
    const sheet = manager.sheet;

    sheet.clear();

    // Set up headers
    sheet
      .getRange(1, 1, 1, SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME].length)
      .setValues([SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME]]);

    const processedFolders = [];
    const processFolderPage = async (folders) => {
      const processedData = processFolderData(folders);
      processedFolders.push(...processedData);

      showToast(
        `Processed ${processedFolders.length} folders...`,
        "Processing Progress"
      );
    };

    // Fetch and process folders
    const totalFolders = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      PAGE_SIZE.ROUTINE_FOLDERS,
      processFolderPage,
      "routine_folders"
    );

    await updateFoldersInSheet(sheet, processedFolders);

    // Format and finish
    manager.formatSheet();

    showToast(
      `Imported ${totalFolders + 1} folders successfully!`,
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
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
function processFolderData(folders) {
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
      folderCount: folders?.length || 0,
    });
  }
}

/**
 * Updates the sheet with folder data
 * @private
 */
async function updateFoldersInSheet(sheet, processedFolders) {
  try {
    if (processedFolders.length > 0) {
      sheet
        .getRange(
          2,
          1,
          processedFolders.length,
          SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME].length
        )
        .setValues(processedFolders);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating folders in sheet",
      sheetName: sheet.getName(),
      folderCount: processedFolders.length,
    });
  }
}
