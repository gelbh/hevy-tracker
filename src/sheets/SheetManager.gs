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
    try {
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
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "SheetManager initialization",
        sheetName: sheetName,
      });
    }
  }

  /**
   * Creates or gets a sheet and returns a manager instance
   * @param {string} sheetName - Name of the sheet
   * @return {SheetManager} manager instance
   */
  static getOrCreate(sheetName) {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }

      return new SheetManager(sheet, sheetName);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Creating/getting sheet",
        sheetName: sheetName,
      });
    }
  }

  /**
   * Applies all formatting to the sheet
   */
  async formatSheet() {
    try {
      await this.ensureHeaders();

      if (this.sheet.getLastRow() > 1) {
        await this.formatData();
        await this.removeEmptyRowsAndColumns();
        await this.setAlternatingColors();
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Formatting sheet",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Ensures headers are present and correct
   * @private
   */
  async ensureHeaders() {
    try {
      if (!(await this.validateHeaders())) {
        // Clear any existing content
        if (this.sheet.getLastRow() > 0) {
          this.sheet.clear();
        }

        const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);

        // Set headers and formatting
        headerRange
          .setValues([this.headers])
          .setFontWeight("bold")
          .setBackground(this.theme.evenRowColor)
          .setFontColor(this.theme.fontColor);

        // Freeze the header row
        this.sheet.setFrozenRows(1);
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Ensuring headers",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Validates existing headers against expected headers
   * @private
   * @returns {Promise<boolean>} True if headers are valid
   */
  async validateHeaders() {
    try {
      if (this.sheet.getLastRow() === 0) return false;

      const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);
      const existingHeaders = headerRange.getValues()[0];

      return this.headers.every(
        (header, index) => existingHeaders[index] === header
      );
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Validating headers",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Formats data with consistent styling
   * @private
   */
  async formatData(numRows, startRow = 2) {
    try {
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
      throw ErrorHandler.handle(error, {
        operation: "Formatting data",
        sheetName: this.sheetName,
        startRow: startRow,
        numRows: numRows,
      });
    }
  }

  /**
   * Removes empty rows and columns from the sheet
   * @private
   */
  async removeEmptyRowsAndColumns() {
    try {
      const maxRows = this.sheet.getMaxRows();
      const maxCols = this.sheet.getMaxColumns();
      const lastRow = this.sheet.getLastRow();
      const lastCol = this.sheet.getLastColumn();

      if (lastRow > 1 && lastRow < maxRows) {
        this.sheet.deleteRows(lastRow + 1, maxRows - lastRow);
      }

      if (lastCol > 0 && lastCol < maxCols) {
        this.sheet.deleteColumns(lastCol + 1, maxCols - lastCol);
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Removing empty rows and columns",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Sets alternating row colors for the entire sheet
   * @private
   */
  async setAlternatingColors() {
    try {
      const lastRow = this.sheet.getLastRow();
      if (lastRow <= 1) return;

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
      throw ErrorHandler.handle(error, {
        operation: "Setting alternating colors",
        sheetName: this.sheetName,
      });
    }
  }
}
