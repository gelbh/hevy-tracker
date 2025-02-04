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
// Weight Management
// -----------------

/**
 * Logs a weight entry with user input
 * @throws {Error} If weight value is invalid or sheet operations fail
 */
function logWeight() {
  try {
    const weight = promptForWeight();
    if (weight === null) return;

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;

    const lastRow = Math.max(1, sheet.getLastRow());
    sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[new Date(), weight]]);

    manager.formatSheet();

    showProgress(
      `Weight of ${weight}kg logged successfully!`,
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
function promptForWeight() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    "Log Weight",
    "Enter weight in kg:",
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return null;

  const weight = parseFloat(result.getResponseText().replace(",", "."));
  if (!(!isNaN(weight) && weight > 0 && weight <= 500)) {
    ui.alert(
      "Invalid weight value. Please enter a number between 0 and 500 kg."
    );
    return null;
  }

  return weight;
}

/**
 * Transfers weight history from published CSV
 * @returns {boolean} Whether the transfer was authorized and attempted
 */
function transferWeightHistory() {
  try {
    // Get published CSV URL for the weight history sheet
    const csvUrl =
      "https://docs.google.com/spreadsheets/d/1vKDObz3ZHoeEBZsyUCpb85AUX3Sc_4V2OmNSyxPEd68/gviz/tq?tqx=out:csv&sheet=Weight+History";

    const response = UrlFetchApp.fetch(csvUrl);
    if (response.getResponseCode() !== 200) {
      throw new Error("Failed to fetch weight data");
    }

    const csvData = response.getContentText();
    const result = processWeightTransferFromCsv(csvData);

    if (result.success) {
      showProgress(
        `Imported ${result.count} weight entries successfully!`,
        "Import Complete",
        TOAST_DURATION.NORMAL
      );
    }
    return true;
  } catch (error) {
    throw ErrorHandler.handle(error, "Transferring weight history");
  }
}

/**
 * Processes CSV data for weight transfer
 * @private
 * @param {string} csvData - Raw CSV data
 * @returns {Object} Result object with success status and count
 */
function processWeightTransferFromCsv(csvData) {
  try {
    const targetManager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const targetSheet = targetManager.sheet;

    // Get existing data to check for duplicates
    const existingData = new Map();
    if (targetSheet.getLastRow() > 1) {
      const existingValues = targetSheet.getDataRange().getValues();
      existingValues.slice(1).forEach((row) => {
        const timestamp = row[0].getTime();
        existingData.set(timestamp, true);
      });
    }

    // Parse CSV data
    const parsedData = Utilities.parseCsv(csvData);

    // Skip header row and prepare new entries
    const newEntries = parsedData
      .slice(1)
      .filter((row) => {
        if (!row[0] || !row[1]) return false;
        const timestamp = new Date(row[0]).getTime();
        return !existingData.has(timestamp) && !isNaN(timestamp);
      })
      .map((row) => [new Date(row[0]), normalizeWeight(parseFloat(row[1]))]);

    if (newEntries.length > 0) {
      const lastRow = Math.max(1, targetSheet.getLastRow());
      targetSheet
        .getRange(lastRow + 1, 1, newEntries.length, 2)
        .setValues(newEntries);

      // Sort by date
      if (targetSheet.getLastRow() > 2) {
        const dataRange = targetSheet.getRange(
          2,
          1,
          targetSheet.getLastRow() - 1,
          2
        );
        dataRange.sort(1);
      }

      targetManager.formatSheet();
    }

    return {
      success: true,
      count: newEntries.length,
    };
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Processing weight transfer",
      source: "CSV data",
    });
  }
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
    const date = new Date(dateString);
    const adjustedDate = new Date(
      date.getTime() - date.getTimezoneOffset() * 60000
    );
    return adjustedDate;
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
