/**
 * Functions for importing and managing routine folders.
 */

/**
 * Imports all workout routine folders from Hevy API.
 * Creates a default "Coach" folder if no other folders exist.
 */
async function importAllRoutineFolders() {
  try {
    const manager = SheetManager.getOrCreate(ROUTINE_FOLDERS_SHEET_NAME);
    const sheet = manager.sheet;

    // Clear existing content while preserving headers
    await clearExistingContent(sheet);

    // Set up headers
    sheet
      .getRange(1, 1, 1, SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME].length)
      .setValues([SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME]]);

    const processedFolders = [];
    const processFolderPage = async (folders) => {
      const processedData = processFolderData(folders);
      processedFolders.push(...processedData);

      showProgress(
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

    // Add default coach folder and update sheet
    await updateFoldersInSheet(sheet, processedFolders);

    // Format and finish
    manager.formatSheet();

    showCompletionMessage(totalFolders, processedFolders.length);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing routine folders",
      sheetName: ROUTINE_FOLDERS_SHEET_NAME,
    });
  }
}

/**
 * Clears existing content while preserving headers
 * @private
 */
async function clearExistingContent(sheet) {
  try {
    sheet.clear();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Clearing folder sheet content",
      sheetName: sheet.getName(),
    });
  }
}

/**
 * Processes folder data into the correct format
 * @private
 */
function processFolderData(folders) {
  try {
    return folders.map((folder) => [folder.id, folder.title]);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing folder data",
      folderCount: folders?.length || 0,
    });
  }
}

/**
 * Updates the sheet with folder data and adds default coach folder
 * @private
 */
async function updateFoldersInSheet(sheet, processedFolders) {
  try {
    // Always add the Coach folder at the top
    sheet.getRange(2, 1, 1, 2).setValues([[111111, "Coach"]]);

    // Add other folders if they exist
    if (processedFolders.length > 0) {
      sheet
        .getRange(3, 1, processedFolders.length, 2)
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

/**
 * Shows the appropriate completion message
 * @private
 */
function showCompletionMessage(totalFolders, processedCount) {
  if (processedCount > 0) {
    showProgress(
      `Imported ${totalFolders + 1} folders successfully!`,
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } else {
    showProgress(
      "Only default Coach folder created.",
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  }
}
