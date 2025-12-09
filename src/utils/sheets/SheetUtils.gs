/**
 * Sheet Management Utilities
 * Provides sheet caching, validation, and management functions
 * @module sheets/SheetUtils
 */

/**
 * Cached sheet references per execution (sheetName -> Sheet)
 * @type {Object<string, GoogleAppsScript.Spreadsheet.Sheet>}
 * @private
 */
const _cachedSheets = {};

/**
 * Validates that a sheet reference is still valid (not stale/deleted)
 * Attempts to access a sheet property to verify it's still accessible
 * @param {GoogleAppsScript.Spreadsheet.Sheet|null} sheet - The sheet to validate
 * @returns {boolean} True if sheet is valid, false if stale/deleted
 * @private
 */
function _validateSheetReference(sheet) {
  if (!sheet) {
    return false;
  }

  try {
    // Attempt to access a property to verify the sheet is still valid
    // If the sheet was deleted, this will throw an error
    const sheetId = sheet.getSheetId();
    return sheetId !== null && sheetId !== undefined;
  } catch (error) {
    // Sheet reference is stale or invalid
    return false;
  }
}

/**
 * Gets a sheet by name (cached per execution)
 * Validates cached references to prevent stale sheet errors
 * @param {string} sheetName - Name of the sheet
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} The sheet or null if not found
 * @private
 */
function _getSheetByName(sheetName) {
  // Check if we have a cached sheet
  const cachedSheet = _cachedSheets[sheetName];

  // Validate cached sheet if it exists
  if (cachedSheet && _validateSheetReference(cachedSheet)) {
    return cachedSheet;
  }

  // Cache is empty or stale, fetch fresh reference
  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  // Only cache if sheet exists
  if (sheet) {
    _cachedSheets[sheetName] = sheet;
  } else {
    // Remove from cache if it was there but is now missing
    delete _cachedSheets[sheetName];
  }

  return sheet;
}
