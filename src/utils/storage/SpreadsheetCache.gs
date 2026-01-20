/**
 * Spreadsheet Cache Utilities
 * Provides cached access to the active spreadsheet instance
 * @module storage/SpreadsheetCache
 */

/**
 * Cached spreadsheet reference per execution
 * @type {GoogleAppsScript.Spreadsheet.Spreadsheet|null}
 * @private
 */
let _cachedSpreadsheet = null;

/**
 * Gets the active spreadsheet instance (cached per execution)
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} Active spreadsheet
 * @throws {Error} If spreadsheet access is unavailable
 */
function getActiveSpreadsheet() {
  if (!_cachedSpreadsheet) {
    try {
      _cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    } catch (error) {
      const errorMessage = error?.message?.toLowerCase() ?? "";
      if (
        errorMessage.includes("permission") &&
        (errorMessage.includes("spreadsheetapp") ||
          errorMessage.includes("spreadsheets"))
      ) {
        error.isDrivePermissionError = true;
      }
      throw error;
    }
  }
  return _cachedSpreadsheet;
}
