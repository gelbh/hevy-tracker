/**
 * Common utility functions for the Hevy API integration
 * @module Utils
 */

// -----------------
// Property Management
// -----------------

/**
 * Gets user properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 */
function getUserProperties() {
  try {
    return PropertiesService.getUserProperties();
  } catch (error) {
    console.error("Failed to get user properties:", error);
    return null;
  }
}

/**
 * Gets document properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null}
 */
function getDocumentProperties() {
  try {
    return PropertiesService.getDocumentProperties();
  } catch (error) {
    console.error("Failed to get document properties:", error);
    return null;
  }
}

// -----------------
// UI Utilities
// -----------------

/**
 * Shows a progress toast with consistent formatting
 * @param {string} message - The message to show
 * @param {string} [title='Progress'] - Toast title
 * @param {number} [duration=TOAST_DURATION.SHORT] - Duration to show toast
 */
function showProgress(
  message,
  title = "Progress",
  duration = TOAST_DURATION.SHORT
) {
  SpreadsheetApp.getActiveSpreadsheet().toast(message, title, duration);
}

/**
 * Creates and shows an HTML dialog from a template file
 * @param {string} filename - Name of the HTML template file (without .html extension)
 * @param {Object} [options] - Configuration options
 * @param {number} [options.width=500] - Dialog width in pixels
 * @param {number} [options.height=500] - Dialog height in pixels
 * @param {string} [options.title=''] - Dialog title
 * @param {string} [options.modalTitle=''] - Title shown in the modal header
 * @param {Object} [options.templateData={}] - Data to pass to the template
 * @param {boolean} [options.showAsSidebar=false] - Whether to show as sidebar
 */
function showHtmlDialog(filename, options = {}) {
  const {
    width = 500,
    height = 500,
    title = "",
    modalTitle = "",
    templateData = {},
    showAsSidebar = false,
  } = options;

  try {
    const html = createHtmlOutput(filename, templateData);
    const htmlOutput = configureHtmlOutput(html, filename, title);
    showDialog(htmlOutput, width, height, modalTitle, showAsSidebar);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      context: "Showing HTML dialog",
      filename,
      options,
    });
  }
}

/**
 * Creates HTML output from template or file
 * @private
 */
function createHtmlOutput(filename, templateData) {
  if (Object.keys(templateData).length > 0) {
    const template = HtmlService.createTemplateFromFile(filename);
    Object.assign(template, templateData);
    return template.evaluate();
  }
  return HtmlService.createHtmlOutputFromFile(filename);
}

/**
 * Configures HTML output with standard settings
 * @private
 */
function configureHtmlOutput(html, filename, title) {
  return html
    .setTitle(title || filename)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

/**
 * Shows the configured dialog
 * @private
 */
function showDialog(htmlOutput, width, height, modalTitle, showAsSidebar) {
  const ui = SpreadsheetApp.getUi();
  if (showAsSidebar) {
    htmlOutput.setWidth(width);
    ui.showSidebar(htmlOutput);
  } else {
    htmlOutput.setWidth(width).setHeight(height);
    ui.showModalDialog(htmlOutput, modalTitle || htmlOutput.getTitle());
  }
}

// -----------------
// Cell Management
// -----------------

/**
 * Syncs a value to a specified cell in a sheet
 * @param {string} sheetName - Name of the sheet containing the target cell
 * @param {string} cellA1Notation - A1 notation of the target cell
 * @param {*} value - The value to set
 * @private
 */
function syncCellValues(sheetName, cellA1Notation, value) {
  try {
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName(sheetName)
      .getRange(cellA1Notation)
      .setValue(value);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Syncing cell values",
      sheetName: sheetName,
      cellNotation: cellA1Notation,
    });
  }
}

/**
 * Checks if a value is valid according to the cell's data validation
 * @param {GoogleAppsScript.Spreadsheet.Range} range - The range to check validation against
 * @param {*} value - The value to validate
 * @return {boolean} True if the value is valid or if there's no validation
 * @private
 */
function isValidCellValue(range, value) {
  try {
    const dataValidation = range.getDataValidation();
    if (!dataValidation) return true;

    const args = dataValidation.getCriteriaValues();

    switch (dataValidation.getCriteriaType()) {
      case SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST:
        return args[0].indexOf(value) !== -1;
      case SpreadsheetApp.DataValidationCriteria.VALUE_IN_RANGE:
        const validValues = args[0].getValues().flat();
        return validValues.indexOf(value) !== -1;
      case SpreadsheetApp.DataValidationCriteria.NUMBER_BETWEEN:
        const min = args[0];
        const max = args[1];
        return value >= min && value <= max;
      default:
        return true;
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Validating cell value",
      range: range.getA1Notation(),
      value,
    });
  }
}

// -----------------
// Weight Management
// -----------------

/**
 * Imports weight entries from a Google Takeout JSON.
 * @param {string} content JSON from Google Takeout
 */
function importWeightFromTakeout(content) {
  try {
    const points = [];
    const data = JSON.parse(content);
    const records = Array.isArray(data["Data Points"])
      ? data["Data Points"]
      : (data.bucket || []).flatMap((b) =>
          (b.dataset || []).flatMap((d) => d.point || [])
        );

    records.forEach((pt) => {
      if (pt.dataTypeName === "com.google.weight") {
        const nanos = pt.startTimeNanos || pt.endTimeNanos;
        const ts = new Date(Number(nanos) / 1e6);
        let kg = null;
        if (pt.value && pt.value[0]?.fpVal != null) {
          kg = pt.value[0].fpVal;
        } else if (pt.fitValue && pt.fitValue[0]?.value?.fpVal != null) {
          kg = pt.fitValue[0].value.fpVal;
        }
        if (kg != null) {
          points.push([ts, Math.round(kg * 100) / 100]);
        }
      }
    });

    points.sort((a, b) => b[0] - a[0]);

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
    }
    if (points.length) {
      sheet.getRange(2, 1, points.length, 2).setValues(points);
    }
    manager.formatSheet();

    showProgress(
      `Imported ${points.length} entries`,
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing weight from Takeout data",
      sheetName: WEIGHT_SHEET_NAME,
    });
  }
}

/**
 * Logs a weight entry with user input
 * @throws {Error} If weight value is invalid or sheet operations fail
 */
function logWeight() {
  try {
    const unit =
      SpreadsheetApp.getActiveSpreadsheet()
        .getSheetByName("Main")
        .getRange("I5")
        .getValue() || "kg";

    const weight = promptForWeight(unit);
    if (weight === null) return;

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;
    const lastRow = Math.max(1, sheet.getLastRow());
    sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[new Date(), weight]]);
    manager.formatSheet();

    showProgress(
      `Weight of ${weight}${unit} logged successfully!`,
      "Success",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, "Logging weight");
  }
}

/**
 * Prompts user for weight input
 * @private
 * @returns {number|null} Weight value or null if canceled/invalid
 */
function promptForWeight(unit = "kg") {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    "Log Body Weight",
    `Enter weight in ${unit}:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return null;

  const weight = parseFloat(result.getResponseText().replace(",", "."));

  const maxWeight = unit === "lbs" ? 1100 : unit === "stone" ? 78.5 : 500;

  if (!(!isNaN(weight) && weight > 0 && weight <= maxWeight)) {
    ui.alert(
      `Invalid weight value. Please enter a number between 0 and ${maxWeight} ${unit}.`
    );
    return null;
  }

  return weight;
}

// -----------------
// Data Formatting
// -----------------

/**
 * Formats a date string consistently accounting for timezone
 * @param {string} dateString - ISO date string to format
 * @returns {Date|string} Formatted date or empty string if invalid
 */
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    return new Date(dateString);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      context: "Formatting date",
      dateString,
    });
  }
}

/**
 * Normalizes weight values for consistency
 * @param {number|null} weight - Weight value to normalize
 * @returns {number|string} Normalized weight value rounded to 2 decimal places or empty string
 */
function normalizeWeight(weight) {
  if (weight === null || weight === undefined) return "";
  return Math.round(weight * 100) / 100;
}

/**
 * Normalizes numeric values for consistency
 * @param {number|null} value - Number to normalize
 * @returns {number|string} Normalized value or empty string if null/undefined
 */
function normalizeNumber(value) {
  if (value === null || value === undefined) return "";
  return value;
}

/**
 * Normalizes set types for consistency
 * @param {number|null} value - Set type to normalize
 * @returns {number|string} Normalized value or empty string if null/undefined
 */
function normalizeSetType(value) {
  if (value === null || value === undefined) return "normal";
  return value;
}

/**
 * Converts column number to letter reference
 * @param {number} column - Column number (1-based)
 * @returns {string} Column letter reference (e.g., 1 -> A, 27 -> AA)
 */
function columnToLetter(column) {
  let letter = "";
  let temp = column;

  while (temp > 0) {
    temp--;
    letter = String.fromCharCode(65 + (temp % 26)) + letter;
    temp = Math.floor(temp / 26);
  }

  return letter;
}

/**
 * Converts a snake_case string to Title Case.
 * @param {string} str
 * @returns {string}
 */
function toTitleCaseFromSnake(str) {
  if (!str) return "";
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Converts an array of snake_case strings into a comma-separated Title Case string.
 * @param {string[]} arr
 * @returns {string}
 */
function arrayToTitleCase(arr) {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((item) => toTitleCaseFromSnake(item))
    .filter(Boolean)
    .join(", ");
}

/**
 * Parses a value into number or null, throwing ValidationError if it’s not numeric.
 * @param {*} value
 * @param {string} fieldName
 * @returns {number|null}
 */
function parseNumber(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (isNaN(n)) {
    throw new ValidationError(`Invalid ${fieldName} value: ${value}`);
  }
  return n;
}

// -----------------
// API Key Management
// -----------------

/**
 * Global function to save Hevy API key, callable from dialog
 * @param {string} apiKey - The API key to save
 * @throws {Error} If saving fails
 */
function saveHevyApiKey(apiKey) {
  return apiClient.saveHevyApiKey(apiKey);
}

// -----------------
// Trigger Management
// -----------------

/**
 * Runs the automatic import process
 * This is the function called by the triggers
 * @returns {Promise<void>}
 */
async function runAutomaticImport() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getId() === TEMPLATE_SPREADSHEET_ID) {
      return;
    }

    const newWorkouts = await importAllWorkouts();
    if (newWorkouts > 0) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
      await importAllRoutineFolders();
      Utilities.sleep(RATE_LIMIT.API_DELAY);
      await importAllExercises();
      Utilities.sleep(RATE_LIMIT.API_DELAY);
      await importAllRoutines();
    }

    ss.toast(
      "Automatic import completed successfully",
      "Automatic Import",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    ErrorHandler.handle(error, { operation: "Running import on open" }, false);
  }
}
