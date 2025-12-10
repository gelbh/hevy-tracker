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
    const sheetId = sheet.getSheetId();
    return sheetId !== null && sheetId !== undefined;
  } catch (error) {
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
  const cachedSheet = _cachedSheets[sheetName];

  if (cachedSheet && _validateSheetReference(cachedSheet)) {
    return cachedSheet;
  }

  const ss = getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (sheet) {
    _cachedSheets[sheetName] = sheet;
  } else {
    delete _cachedSheets[sheetName];
  }

  return sheet;
}

/**
 * Safely extracts the sheet name from a range object, handling stale references
 * Returns null if the sheet reference is stale (sheet was deleted/renamed)
 * @param {GoogleAppsScript.Spreadsheet.Range} range - The range to get the sheet name from
 * @returns {string|null} The sheet name, or null if the sheet no longer exists or is stale
 */
function getSheetNameFromRange(range) {
  if (!range) {
    return null;
  }

  try {
    const sheet = range.getSheet();
    if (!sheet) {
      return null;
    }

    // Validate sheet reference by accessing a property
    // If the sheet was deleted, this will throw an error
    const sheetId = sheet.getSheetId();
    if (sheetId === null || sheetId === undefined) {
      return null;
    }

    return sheet.getName();
  } catch (error) {
    // Sheet reference is stale or deleted
    return null;
  }
}
