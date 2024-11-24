/**
 * Common utility functions for the Hevy API integration
 */

/**
 * Transfers weight history data from template sheet to official Weight History sheet
 * and removes the source sheet and associated form
 * Only processes transfer if the user has the authorized API key
 * @param {boolean} [showMessages=true] Whether to show progress messages
 * @returns {boolean} Whether the transfer was authorized and attempted
 */
function transferWeightHistory(showMessages = true) {
  try {
    const properties = getUserProperties();
    if (!properties) {
      throw new ConfigurationError("Unable to access user properties");
    }

    const currentKey = properties.getProperty("HEVY_API_KEY");
    if (
      !currentKey ||
      currentKey !== Config.AUTHORIZED_API_KEY ||
      !Config.isAuthorized
    ) {
      return false;
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    try {
      const existingTempSheet = ss.getSheetByName("TempSheet");
      if (existingTempSheet) {
        ss.deleteSheet(existingTempSheet);
      }
    } catch (e) {
      Logger.debug("Error cleaning up existing temp sheet", e);
    }

    const sourceSheet = ss.getSheetByName("My Weight History");
    if (!sourceSheet) {
      return true;
    }

    const transferKey = `WEIGHT_TRANSFER_${ss.getId()}`;
    if (properties.getProperty(transferKey)) {
      return true;
    }

    const targetManager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const targetSheet = targetManager.sheet;

    const sourceData = sourceSheet.getDataRange().getValues();
    let transferCount = 0;

    if (sourceData.length > 1) {
      sourceData.shift();
      transferCount = sourceData.length;

      const lastRow = Math.max(1, targetSheet.getLastRow());
      targetSheet
        .getRange(lastRow + 1, 1, sourceData.length, 2)
        .setValues(sourceData);

      targetManager.formatSheet();
    }

    try {
      const formUrl = sourceSheet.getFormUrl();
      if (formUrl) {
        const form = FormApp.openByUrl(formUrl);
        const formResponses = form.getResponses();
        for (const response of formResponses) {
          form.deleteResponse(response.getId());
        }

        form.removeDestination();

        ss.deleteSheet(sourceSheet);

        const formFile = DriveApp.getFileById(form.getId());
        formFile.setTrashed(true);
      }
    } catch (e) {
      Logger.debug("Error during form/sheet cleanup", e);
      throw e;
    }

    properties.setProperty(transferKey, "true");

    if (showMessages && transferCount > 0) {
      showProgress(
        `Successfully transferred ${transferCount} weight records and removed the source sheet!`,
        "Transfer Complete",
        TOAST_DURATION.NORMAL
      );
    }

    return true;
  } catch (error) {
    handleError(error, "Transferring weight history");
    return false;
  }
}

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

    return {
      url: newSpreadsheet.getUrl(),
    };
  } catch (error) {
    handleError(error, "Creating template spreadsheet");
    throw error;
  }
}

/**
 * Creates and shows an HTML dialog from a template file with standard configuration
 * @param {string} filename - Name of the HTML template file (without .html extension)
 * @param {Object} [options] - Configuration options
 * @param {number} [options.width=500] - Dialog width in pixels
 * @param {number} [options.height=500] - Dialog height in pixels
 * @param {string} [options.title=''] - Dialog title
 * @param {string} [options.modalTitle=''] - Title shown in the modal header (defaults to title if not provided)
 * @param {Object} [options.templateData={}] - Data to pass to the template
 * @param {boolean} [options.showAsSidebar=false] - Whether to show as sidebar instead of modal
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
    let html;
    if (Object.keys(templateData).length > 0) {
      const template = HtmlService.createTemplateFromFile(filename);
      Object.assign(template, templateData);
      html = template.evaluate();
    } else {
      html = HtmlService.createHtmlOutputFromFile(filename);
    }

    const htmlOutput = html
      .setTitle(title || filename)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);

    if (!showAsSidebar) {
      htmlOutput.setWidth(width).setHeight(height);
      SpreadsheetApp.getUi().showModalDialog(
        htmlOutput,
        modalTitle || title || filename
      );
    } else {
      htmlOutput.setWidth(width);
      SpreadsheetApp.getUi().showSidebar(htmlOutput);
    }
  } catch (error) {
    handleError(error, {
      context: "Showing HTML dialog",
      filename,
      options,
    });
    throw error;
  }
}

function getUserProperties() {
  try {
    return PropertiesService.getUserProperties();
  } catch (error) {
    console.error("Failed to get user properties:", error);
    return null;
  }
}

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
 * Converts column number to letter reference (e.g., 1 -> A, 27 -> AA)
 * @param {number} column - Column number (1-based)
 * @returns {string} Column letter reference
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
 * Function for logging and managing weight data
 * Prompts user for weight input and stores it in the Weight History sheet
 * @throws {Error} If weight value is invalid or sheet operations fail
 */
function logWeight() {
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.prompt(
      "Log Weight",
      "Enter weight in kg:",
      ui.ButtonSet.OK_CANCEL
    );

    if (result.getSelectedButton() === ui.Button.OK) {
      const weightStr = result.getResponseText().replace(",", ".");
      const weight = parseFloat(weightStr);

      if (isNaN(weight) || weight <= 0 || weight > 500) {
        ui.alert(
          "Invalid weight value. Please enter a number between 0 and 500 kg."
        );
        return;
      }

      const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
      const sheet = manager.sheet;

      const lastRow = Math.max(1, sheet.getLastRow());
      const nextRow = lastRow + 1;

      sheet.getRange(nextRow, 1, 1, 2).setValues([[new Date(), weight]]);

      manager.formatSheet();

      showProgress(
        `Weight of ${weight}kg logged successfully!`,
        "Success",
        TOAST_DURATION.NORMAL
      );
    }
  } catch (error) {
    handleError(error, "Logging weight");
  }
}

/**
 * Global function to save Hevy API key, callable from dialog
 * @param {string} apiKey - The API key to save
 * @throws {Error} If saving fails
 */
function saveHevyApiKey(apiKey) {
  return apiClient.saveHevyApiKey(apiKey);
}
