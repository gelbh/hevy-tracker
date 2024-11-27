/**
 * SheetManager.gs
 * Centralized class for handling all sheet formatting and manipulation operations
 */

class SheetManager {
  /**
   * Creates a new SheetManager instance
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The sheet to format
   * @param {string} sheetName - Name of the sheet (must match Constants.gs SHEET_HEADERS key)
   */
  constructor(sheet, sheetName) {
    this.sheet = sheet;
    this.sheetName = sheetName;
    this.theme = SHEET_THEMES[sheetName];
    this.headers = SHEET_HEADERS[sheetName];

    if (!this.headers) {
      throw new ValidationError(`No headers defined for sheet: ${sheetName}`);
    }
    if (!this.theme) {
      throw new ValidationError(`No theme defined for sheet: ${sheetName}`);
    }
  }

  /**
   * Creates or gets a sheet and returns a manager instance
   * @param {string} sheetName - Name of the sheet
   * @return {SheetManager} manager instance
   */
  static getOrCreate(sheetName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      try {
        sheet = ss.insertSheet(sheetName);
      } catch (error) {
        throw new ConfigurationError(
          `Failed to create sheet ${sheetName}: ${error.message}`
        );
      }
    }

    const manager = new SheetManager(sheet, sheetName);

    return manager;
  }

  /**
   * Applies all formatting to the sheet
   */
  formatSheet() {
    try {
      this.ensureHeaders();

      if (this.sheet.getLastRow() > 1) {
        this.formatData();
        this.removeEmptyRowsAndColumns();
        this.setAlternatingColors();
      }
    } catch (error) {
      handleError(error, `Formatting sheet ${this.sheetName}`);
    }
  }

  /**
   * Formats data with consistent styling
   */
  formatData(startRow, numRows) {
    try {
      if (!startRow) startRow = 2;
      if (!numRows) {
        numRows = Math.max(0, this.sheet.getLastRow() - startRow + 1);
      }

      if (numRows <= 0) return;

      const range = this.sheet.getRange(
        startRow,
        1,
        numRows,
        this.sheet.getLastColumn()
      );

      range
        .setFontFamily("Arial")
        .setFontSize(11)
        .setVerticalAlignment("middle")
        .setBorder(
          true,
          true,
          true,
          true,
          true,
          true,
          this.theme.borderColor,
          SpreadsheetApp.BorderStyle.SOLID
        );
    } catch (error) {
      Logger.error(`Formatting data in sheet ${this.sheetName}`, error);
    }
  }

  /**
   * Ensures headers are present and correct
   */
  ensureHeaders() {
    if (!this.validateHeaders()) {
      // Clear any existing content
      if (this.sheet.getLastRow() > 0) {
        this.sheet.clear();
      }

      // Set headers in first row
      this.sheet
        .getRange(1, 1, 1, this.headers.length)
        .setValues([this.headers])
        .setFontWeight("bold")
        .setBackground(this.theme.evenRowColor)
        .setFontColor(this.theme.fontColor);

      // Freeze the header row
      this.sheet.setFrozenRows(1);
    }
  }

  /**
   * Checks if headers are present and match expected headers
   * @returns {boolean} True if headers are present and correct
   */
  validateHeaders() {
    if (this.sheet.getLastRow() === 0) return false;

    const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);
    const existingHeaders = headerRange.getValues()[0];

    return this.headers.every(
      (header, index) => existingHeaders[index] === header
    );
  }

  /**
   * Removes empty rows and columns from the sheet
   */
  removeEmptyRowsAndColumns() {
    try {
      const maxRows = this.sheet.getMaxRows();
      const maxCols = this.sheet.getMaxColumns();
      const lastRow = this.sheet.getLastRow();
      const lastCol = this.sheet.getLastColumn();

      // Only delete rows if we have more than the header row
      if (lastRow > 1 && lastRow < maxRows) {
        this.sheet.deleteRows(lastRow + 1, maxRows - lastRow);
      }

      // Only delete columns if we have some data
      if (lastCol > 0 && lastCol < maxCols) {
        this.sheet.deleteColumns(lastCol + 1, maxCols - lastCol);
      }
    } catch (error) {
      handleError(error, "Removing empty rows and columns");
    }
  }

  /**
   * Sets alternating row colors for the entire sheet
   */
  setAlternatingColors() {
    try {
      const lastRow = this.sheet.getLastRow();
      if (lastRow <= 1) return; // Don't set colors if we only have headers

      const range = this.sheet.getRange(
        2,
        1,
        lastRow - 1,
        this.sheet.getLastColumn()
      );

      this.sheet.clearConditionalFormatRules();

      const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=0")
        .setBackground(this.theme.evenRowColor)
        .build();

      const oddRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=1")
        .setBackground(this.theme.oddRowColor)
        .build();

      this.sheet.setConditionalFormatRules([evenRowRule, oddRowRule]);
    } catch (error) {
      handleError(error, "Updating alternating colors");
    }
  }
}
