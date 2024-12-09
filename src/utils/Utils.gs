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
    throw ErrorHandler.handle(error, "Transferring weight history");
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

  if (typeof AUTHORIZED_API_KEY !== "undefined") {
    return currentKey && currentKey === AUTHORIZED_API_KEY;
  }

  return false;
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
    ErrorHandler.handle(e, "Cleaning up temporary sheet");
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
    throw e;
  }
}

// -----------------
// Template Management
// -----------------

/**
 * Creates a copy of the template spreadsheet using drive.file scope
 * @return {Object} Object containing the new spreadsheet URL
 */
function makeTemplateCopy() {
  try {
    const TEMPLATE_ID = "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

    // Create new spreadsheet
    const newSpreadsheet = SpreadsheetApp.create("Hevy Tracker - My Workouts");
    const defaultSheet = newSpreadsheet.getSheets()[0];

    // Get template spreadsheet
    const templateSpreadsheet = SpreadsheetApp.openById(TEMPLATE_ID);

    // First, get all named functions from template using XLSX export
    const namedFunctions =
      getNamedFunctionsFromSpreadsheet(templateSpreadsheet);

    // Copy sheets in specific order
    const sheetCopyOrder = [
      WORKOUTS_SHEET_NAME,
      EXERCISES_SHEET_NAME,
      ROUTINES_SHEET_NAME,
      ROUTINE_FOLDERS_SHEET_NAME,
      WEIGHT_SHEET_NAME,
    ];

    // Copy main data sheets first
    sheetCopyOrder.forEach((sheetName) => {
      const templateSheet = templateSpreadsheet.getSheetByName(sheetName);
      if (templateSheet) {
        copySheetPreservingFormulas(templateSheet, newSpreadsheet);
      }
    });

    // Copy remaining sheets
    templateSpreadsheet.getSheets().forEach((sheet) => {
      if (!sheetCopyOrder.includes(sheet.getName())) {
        copySheetPreservingFormulas(sheet, newSpreadsheet);
      }
    });

    // Delete default sheet
    if (newSpreadsheet.getSheets().length > 1) {
      newSpreadsheet.deleteSheet(defaultSheet);
    }

    // Create named functions in new spreadsheet by inserting them as LAMBDA functions
    if (namedFunctions && namedFunctions.length > 0) {
      const functionSheet = newSpreadsheet.insertSheet("_Functions");
      namedFunctions.forEach((func, index) => {
        // Insert each function definition
        const cell = functionSheet.getRange(index + 1, 1);
        const formula = `=${func.definedFunction}`;
        cell.setFormula(formula);

        // Create named range referencing the LAMBDA function
        newSpreadsheet.setNamedRange(func.definedName, cell);
      });

      // Hide the functions sheet
      functionSheet.hideSheet();
    }

    return { url: newSpreadsheet.getUrl() };
  } catch (error) {
    throw ErrorHandler.handle(error, "Creating template spreadsheet");
  }
}

/**
 * Gets named functions from a spreadsheet by exporting to XLSX
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet - Source spreadsheet
 * @return {Array<{definedName: string, definedFunction: string}>} Array of named functions
 * @private
 */
function getNamedFunctionsFromSpreadsheet(spreadsheet) {
  try {
    const url = `https://docs.google.com/spreadsheets/export?exportFormat=xlsx&id=${spreadsheet.getId()}`;
    const response = UrlFetchApp.fetch(url, {
      headers: { authorization: "Bearer " + ScriptApp.getOAuthToken() },
    });

    const blobs = Utilities.unzip(response.getBlob());
    const workbook = blobs.find((b) => b.getName() == "xl/workbook.xml");

    if (!workbook) return [];

    const root = XmlService.parse(workbook.getDataAsString()).getRootElement();
    const definedNamesElement = root.getChild(
      "definedNames",
      root.getNamespace()
    );

    if (!definedNamesElement) return [];

    return definedNamesElement.getChildren().map((e) => ({
      definedName: e.getAttribute("name").getValue(),
      definedFunction: e.getValue(),
    }));
  } catch (error) {
    console.error("Error getting named functions:", error);
    return [];
  }
}

/**
 * Copies a sheet while preserving formulas and table references
 * @private
 */
function copySheetPreservingFormulas(sourceSheet, targetSpreadsheet) {
  // First, copy the sheet normally
  const newSheet = sourceSheet.copyTo(targetSpreadsheet);
  newSheet.setName(sourceSheet.getName());

  // Copy basic formatting
  newSheet.setFrozenRows(sourceSheet.getFrozenRows());
  newSheet.setFrozenColumns(sourceSheet.getFrozenColumns());

  // Get all formulas from source sheet
  const sourceRange = sourceSheet.getDataRange();
  const sourceFormulas = sourceRange.getFormulas();

  // If there are any formulas, copy them exactly as they are
  if (sourceFormulas.some((row) => row.some((cell) => cell !== ""))) {
    const targetRange = newSheet.getRange(
      1,
      1,
      sourceRange.getNumRows(),
      sourceRange.getNumColumns()
    );
    targetRange.setFormulas(sourceFormulas);
  }

  // Apply theme formatting
  applySheetTheme(newSheet);

  return newSheet;
}

/**
 * Applies theme formatting to a sheet
 * @private
 */
function applySheetTheme(sheet) {
  const theme = SHEET_THEMES[sheet.getName()];
  if (theme) {
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());

      // Create even row rule
      const evenRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=0")
        .setBackground(theme.evenRowColor)
        .build();

      // Create odd row rule
      const oddRowRule = SpreadsheetApp.newConditionalFormatRule()
        .setRanges([range])
        .whenFormulaSatisfied("=MOD(ROW(),2)=1")
        .setBackground(theme.oddRowColor)
        .build();

      sheet.setConditionalFormatRules([evenRowRule, oddRowRule]);
    }

    // Add specific formatting for Exercises sheet
    if (sheet.getName() === EXERCISES_SHEET_NAME) {
      addDuplicateHighlighting(new SheetManager(sheet, EXERCISES_SHEET_NAME));
    }
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
