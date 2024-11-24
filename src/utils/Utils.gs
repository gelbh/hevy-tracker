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
    handleError(error, {
      context: "Showing HTML dialog",
      filename,
      options,
    });
    throw error;
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

    appendWeightEntry(sheet, weight);
    manager.formatSheet();

    showProgress(
      `Weight of ${weight}kg logged successfully!`,
      "Success",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    handleError(error, "Logging weight");
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
  if (!isValidWeight(weight)) {
    ui.alert(
      "Invalid weight value. Please enter a number between 0 and 500 kg."
    );
    return null;
  }

  return weight;
}

/**
 * Validates weight value
 * @private
 */
function isValidWeight(weight) {
  return !isNaN(weight) && weight > 0 && weight <= 500;
}

/**
 * Appends weight entry to sheet
 * @private
 */
function appendWeightEntry(sheet, weight) {
  const lastRow = Math.max(1, sheet.getLastRow());
  sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[new Date(), weight]]);
}

/**
 * Transfers weight history from template
 * @param {boolean} [showMessages=true] Whether to show progress messages
 * @returns {boolean} Whether the transfer was authorized and attempted
 */
function transferWeightHistory(showMessages = true) {
  try {
    if (!authorizeTransfer()) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    cleanupTempSheet(ss);

    const sourceSheet = ss.getSheetByName("My Weight History");
    if (!sourceSheet) return true;

    if (isTransferComplete(ss)) return true;

    const result = processWeightTransfer(sourceSheet);
    if (result.success) {
      markTransferComplete(ss);
      showTransferComplete(result.count, showMessages);
    }

    return true;
  } catch (error) {
    handleError(error, "Transferring weight history");
    return false;
  }
}

/**
 * Authorizes weight transfer
 * @private
 */
function authorizeTransfer() {
  const properties = getUserProperties();
  if (!properties) {
    throw new ConfigurationError("Unable to access user properties");
  }

  const currentKey = properties.getProperty("HEVY_API_KEY");
  return currentKey && currentKey === AUTHORIZED_API_KEY;
}

/**
 * Checks if transfer is already complete
 * @private
 */
function isTransferComplete(spreadsheet) {
  const properties = getUserProperties();
  const transferKey = `WEIGHT_TRANSFER_${spreadsheet.getId()}`;
  return properties.getProperty(transferKey);
}

/**
 * Marks transfer as complete
 * @private
 */
function markTransferComplete(spreadsheet) {
  const properties = getUserProperties();
  const transferKey = `WEIGHT_TRANSFER_${spreadsheet.getId()}`;
  properties.setProperty(transferKey, "true");
}

/**
 * Shows transfer completion message
 * @private
 */
function showTransferComplete(count, showMessages) {
  if (showMessages && count > 0) {
    showProgress(
      `Successfully transferred ${count} weight records and removed the source sheet!`,
      "Transfer Complete",
      TOAST_DURATION.NORMAL
    );
  }
}

/**
 * Processes the weight transfer
 * @private
 */
function processWeightTransfer(sourceSheet) {
  const targetManager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
  const targetSheet = targetManager.sheet;
  const sourceData = sourceSheet.getDataRange().getValues();
  let transferCount = 0;

  if (sourceData.length > 1) {
    sourceData.shift(); // Remove header row
    transferCount = sourceData.length;

    const lastRow = Math.max(1, targetSheet.getLastRow());
    targetSheet
      .getRange(lastRow + 1, 1, sourceData.length, 2)
      .setValues(sourceData);

    targetManager.formatSheet();
  }

  cleanupSourceSheet(sourceSheet);
  return { success: true, count: transferCount };
}

/**
 * Cleans up temporary sheet
 * @private
 */
function cleanupTempSheet(spreadsheet) {
  try {
    const tempSheet = spreadsheet.getSheetByName("TempSheet");
    if (tempSheet) {
      spreadsheet.deleteSheet(tempSheet);
    }
  } catch (e) {
    Logger.debug("Error cleaning up existing temp sheet", e);
  }
}

/**
 * Cleans up source sheet and form
 * @private
 */
function cleanupSourceSheet(sourceSheet) {
  try {
    const formUrl = sourceSheet.getFormUrl();
    if (formUrl) {
      const form = FormApp.openByUrl(formUrl);
      const formResponses = form.getResponses();
      formResponses.forEach((response) =>
        form.deleteResponse(response.getId())
      );
      form.removeDestination();

      const spreadsheet = sourceSheet.getParent();
      spreadsheet.deleteSheet(sourceSheet);

      const formFile = DriveApp.getFileById(form.getId());
      formFile.setTrashed(true);
    }
  } catch (e) {
    Logger.debug("Error during form/sheet cleanup", e);
    throw e;
  }
}

// -----------------
// Template Management
// -----------------

/**
 * Creates a copy of the template spreadsheet
 * @return {Object} Object containing the new spreadsheet URL
 */
function makeTemplateCopy() {
  try {
    const TEMPLATE_ID = "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";
    const templateFile = DriveApp.getFileById(TEMPLATE_ID);
    const newFile = templateFile.makeCopy("Hevy Tracker - My Workouts");
    const newSpreadsheet = SpreadsheetApp.open(newFile);

    return { url: newSpreadsheet.getUrl() };
  } catch (error) {
    handleError(error, "Creating template spreadsheet");
    throw error;
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
    Logger.error("Error formatting date", { dateString }, error);
    return "";
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
