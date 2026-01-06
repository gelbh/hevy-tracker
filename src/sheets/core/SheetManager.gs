/**
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
      // Validate sheet parameter is provided
      if (!sheet) {
        throw new SheetError(
          `Sheet "${sheetName}" is null or undefined`,
          sheetName,
          {
            operation: "SheetManager constructor",
          }
        );
      }

      // Validate sheet reference is still valid (not stale/deleted)
      try {
        const sheetId = sheet.getSheetId();
        if (sheetId === null || sheetId === undefined) {
          throw new SheetError(
            `Sheet "${sheetName}" reference is invalid`,
            sheetName,
            {
              operation: "SheetManager constructor",
            }
          );
        }
      } catch (error) {
        // If accessing sheet properties throws, the sheet is stale/deleted
        if (error instanceof SheetError) {
          throw error;
        }
        throw new SheetError(
          `Sheet "${sheetName}" reference is stale or has been deleted`,
          sheetName,
          {
            operation: "SheetManager constructor",
            originalError: error.message,
          }
        );
      }

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
        sheetName,
      });
    }
  }

  /**
   * Creates or gets a sheet and returns a manager instance
   * @param {string} sheetName - Name of the sheet
   * @returns {SheetManager} Manager instance
   */
  static getOrCreate(sheetName) {
    try {
      const ss = getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName) ?? ss.insertSheet(sheetName);

      return new SheetManager(sheet, sheetName);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Creating/getting sheet",
        sheetName,
      });
    }
  }

  /**
   * Formatting Operations
   */

  /**
   * Applies all formatting to the sheet
   * @param {Function} [checkTimeout] - Optional function that returns true if timeout is approaching
   */
  async formatSheet(checkTimeout = null) {
    try {
      // Check timeout before expensive operations
      if (checkTimeout && checkTimeout()) {
        // Formatting is non-critical, so skip it if timeout is approaching
        return;
      }

      await this.ensureHeaders();

      if (this.sheet.getLastRow() <= 1) {
        return;
      }

      // Check timeout before formatting operations
      if (checkTimeout && checkTimeout()) {
        return;
      }

      this.formatData();
      this.removeEmptyRowsAndColumns();
      this.setAlternatingColors();
    } catch (error) {
      // Don't throw ImportTimeoutError - formatting is non-critical
      if (error instanceof ImportTimeoutError) {
        return;
      }
      throw ErrorHandler.handle(error, {
        operation: "Formatting sheet",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Header Management
   */

  /**
   * Ensures headers are present and correct
   * @private
   */
  async ensureHeaders() {
    try {
      if (this.validateHeaders()) {
        return;
      }

      const lastRow = this.sheet.getLastRow();
      const hasData = lastRow > 0;

      if (hasData) {
        const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);

        headerRange
          .setValues([this.headers])
          .setFontWeight("bold")
          .setBackground(this.theme.evenRowColor)
          .setFontColor(this.theme.fontColor);
      } else {
        const headerRange = this.sheet.getRange(1, 1, 1, this.headers.length);

        headerRange
          .setValues([this.headers])
          .setFontWeight("bold")
          .setBackground(this.theme.evenRowColor)
          .setFontColor(this.theme.fontColor);
      }

      this.sheet.setFrozenRows(1);
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Ensuring headers",
        sheetName: this.sheetName,
      });
    }
  }

  /**
   * Validates existing headers against expected headers
   * @returns {boolean} True if headers are valid
   */
  validateHeaders() {
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
   * Gets the data range (excluding header row)
   * @param {number} [numRows] - Number of rows (defaults to all data rows)
   * @param {number} [startRow=2] - Starting row index
   * @returns {GoogleAppsScript.Spreadsheet.Range|null} Data range or null if no data
   * @private
   */
  _getDataRange(numRows, startRow = 2) {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < startRow) {
      return null;
    }

    const rowsToFormat = numRows ?? lastRow - startRow + 1;
    const lastCol = this.sheet.getLastColumn();

    if (rowsToFormat <= 0 || lastCol <= 0) {
      return null;
    }

    return this.sheet.getRange(startRow, 1, rowsToFormat, lastCol);
  }

  /**
   * Formats data with consistent styling
   * @param {number} [numRows] - Number of rows to format (defaults to all data rows)
   * @param {number} [startRow=2] - Starting row index
   * @private
   */
  formatData(numRows, startRow = 2) {
    try {
      const range = this._getDataRange(numRows, startRow);
      if (!range) {
        return;
      }

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
        startRow,
        numRows,
      });
    }
  }

  /**
   * Removes empty rows and columns from the sheet
   * @private
   */
  removeEmptyRowsAndColumns() {
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
   * Sets alternating row colors for the entire sheet using conditional formatting
   * @private
   */
  setAlternatingColors() {
    try {
      const range = this._getDataRange();
      if (!range) {
        return;
      }

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

  /**
   * Data Operations
   */

  /**
   * Clears the sheet except for headers
   * @private
   */
  clearSheet() {
    try {
      const range = this._getDataRange();
      if (range) {
        range.clear();
      }
    } catch (error) {
      throw ErrorHandler.handle(error, {
        operation: "Clearing sheet",
        sheetName: this.sheetName,
      });
    }
  }
}
