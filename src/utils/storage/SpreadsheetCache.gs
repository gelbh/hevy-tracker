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
    _cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }
  return _cachedSpreadsheet;
}
