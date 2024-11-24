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
    
    sheet.getRange(1, 1, 1, SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME].length)
         .setValues([SHEET_HEADERS[ROUTINE_FOLDERS_SHEET_NAME]]);
    
    const processedFolders = [];
    const processFolderPage = async (folders) => {
      const processedData = folders.map(folder => [
        folder.id,
        folder.title
      ]);
      processedFolders.push(...processedData);
      
      showProgress(
        `Processed ${processedFolders.length} folders...`, 
        'Processing Progress'
      );
    };
    
    const totalFolders = await apiClient.fetchPaginatedData(
      API_ENDPOINTS.ROUTINE_FOLDERS,
      PAGE_SIZE.ROUTINE_FOLDERS,
      processFolderPage,
      'routine_folders'
    );
    
    if (processedFolders.length > 0) {
      sheet.getRange(2, 1, 1, 2).setValues([[111111, 'Coach']]);
      
      if (processedFolders.length > 0) {
        sheet.getRange(3, 1, processedFolders.length, 2)
             .setValues(processedFolders);
      }

      manager.formatSheet();
      
      showProgress(
        `Imported ${totalFolders + 1} folders successfully!`,
        'Import Complete',
        TOAST_DURATION.NORMAL
      );
    } else {
      sheet.getRange(2, 1, 1, 2).setValues([[111111, 'Coach']]);
      
      manager.formatSheet();
      
      showProgress('Only default Coach folder created.', 'Import Complete', TOAST_DURATION.NORMAL);
    }
  } catch (error) {
    handleError(error, 'Importing routine folders');
  }
}