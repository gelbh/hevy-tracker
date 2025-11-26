/**
 * Common utility functions for the Hevy API integration
 * @module Utils
 */

/**
 * Gets properties service safely with error handling
 * @param {Function} serviceGetter - Function to get the properties service
 * @param {string} serviceName - Name of the service for error logging
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 * @private
 */
function getPropertiesSafely(serviceGetter, serviceName) {
  try {
    return serviceGetter();
  } catch (error) {
    console.error(`Failed to get ${serviceName}:`, error);
    return null;
  }
}

/**
 * Gets user properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 */
function getUserProperties() {
  return getPropertiesSafely(
    () => PropertiesService.getUserProperties(),
    "user properties"
  );
}

/**
 * Gets document properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 */
function getDocumentProperties() {
  return getPropertiesSafely(
    () => PropertiesService.getDocumentProperties(),
    "document properties"
  );
}

/**
 * UI Utilities
 */

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

/**
 * Cell Management
 */

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

/**
 * Weight Management
 */

/**
 * Extracts weight value from a data point
 * @param {Object} point - Data point from Google Takeout
 * @returns {number|null} Weight in kg or null
 * @private
 */
function extractWeightFromPoint(point) {
  if (point.value?.[0]?.fpVal != null) {
    return point.value[0].fpVal;
  }
  if (point.fitValue?.[0]?.value?.fpVal != null) {
    return point.fitValue[0].value.fpVal;
  }
  return null;
}

/**
 * Imports weight entries from a Google Takeout JSON
 * @param {string} content - JSON content from Google Takeout
 */
function importWeightFromTakeout(content) {
  try {
    const data = JSON.parse(content);
    const records = Array.isArray(data["Data Points"])
      ? data["Data Points"]
      : (data.bucket || []).flatMap((b) =>
          (b.dataset || []).flatMap((d) => d.point || [])
        );

    const points = records
      .filter((pt) => pt.dataTypeName === "com.google.weight")
      .map((pt) => {
        const nanos = pt.startTimeNanos || pt.endTimeNanos;
        const ts = new Date(Number(nanos) / 1e6);
        const kg = extractWeightFromPoint(pt);
        return kg != null ? [ts, Math.round(kg * 100) / 100] : null;
      })
      .filter(Boolean)
      .sort((a, b) => b[0] - a[0]);

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
    }
    if (points.length) {
      sheet.getRange(2, 1, points.length, 2).setValues(points);
    }
    manager.formatSheet();

    SpreadsheetApp.getActiveSpreadsheet().toast(
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

    SpreadsheetApp.getActiveSpreadsheet().toast(
      `Weight of ${weight}${unit} logged successfully!`,
      "Success",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, "Logging weight");
  }
}

/**
 * Gets maximum weight value for a given unit
 * @param {string} unit - Weight unit (kg, lbs, stone)
 * @returns {number} Maximum weight value
 * @private
 */
function getMaxWeight(unit) {
  const maxWeights = {
    lbs: 1100,
    stone: 78.5,
    kg: 500,
  };
  return maxWeights[unit] || 500;
}

/**
 * Validates weight input
 * @param {number} weight - Weight value to validate
 * @param {string} unit - Weight unit
 * @returns {boolean} True if weight is valid
 * @private
 */
function isValidWeight(weight, unit) {
  const maxWeight = getMaxWeight(unit);
  return !isNaN(weight) && weight > 0 && weight <= maxWeight;
}

/**
 * Prompts user for weight input
 * @param {string} [unit="kg"] - Weight unit
 * @returns {number|null} Weight value or null if canceled/invalid
 * @private
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
  const maxWeight = getMaxWeight(unit);

  if (!isValidWeight(weight, unit)) {
    ui.alert(
      `Invalid weight value. Please enter a number between 0 and ${maxWeight} ${unit}.`
    );
    return null;
  }

  return weight;
}

/**
 * Data Formatting
 */

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

/**
 * API Key Management
 */

const DEV_API_KEY_PREFIX = "DEV_API_KEY_";

/**
 * Gets the property key for a developer API key
 * @param {string} label - The label for the API key
 * @returns {string} Property key
 * @private
 */
function getDevApiKeyPropertyKey(label) {
  return `${DEV_API_KEY_PREFIX}${label}`;
}

/**
 * Serializes error for HTML service compatibility
 * Custom error objects need to be converted to plain Error objects
 * @param {Error} error - The error to serialize
 * @returns {Error} Serialized error with message string
 * @private
 */
function serializeErrorForHtml(error) {
  // HTML service can only serialize plain Error objects with message strings
  // Custom error types need to be converted
  // Use error.name for more reliable cross-file checking
  if (error && error.name && typeof error.message === "string") {
    const errorName = error.name;
    if (
      errorName === "InvalidApiKeyError" ||
      errorName === "ApiError" ||
      errorName === "ValidationError" ||
      errorName === "ConfigurationError" ||
      errorName === "SheetError" ||
      errorName === "DrivePermissionError"
    ) {
      // Create a plain Error with the message for HTML service
      const plainError = new Error(error.message);
      plainError.name = errorName;
      return plainError;
    }
  }

  // If it's already a plain Error, return as-is
  if (error instanceof Error) {
    return error;
  }

  // For any other type, convert to Error
  return new Error(String(error));
}

/**
 * Global function to save Hevy API key, callable from dialog
 * This wrapper ensures errors are properly serialized for HTML service
 * @param {string} apiKey - The API key to save
 */
function saveUserApiKey(apiKey) {
  try {
    // Call the async method - google.script.run will handle the async execution
    // but we need to ensure errors are serializable
    const result = apiClient.saveUserApiKey(apiKey);

    // If it returns a promise, we can't await it here (sync function)
    // But errors thrown will be caught below and serialized
    return result;
  } catch (error) {
    // Ensure error is serializable for HTML service
    throw serializeErrorForHtml(error);
  }
}

/**
 * Saves a developer API key to script properties
 * @param {string} label - The label for the API key
 * @param {string} key - The API key to save
 */
function saveDevApiKey(label, key) {
  PropertiesService.getScriptProperties().setProperty(
    getDevApiKeyPropertyKey(label),
    key
  );
}

/**
 * Switches to a different API key based on the label
 * @param {string} label - The label of the API key to switch to
 */
function useApiKey(label) {
  const storedKey = PropertiesService.getScriptProperties().getProperty(
    getDevApiKeyPropertyKey(label)
  );

  if (!storedKey) {
    SpreadsheetApp.getUi().alert(`No key found for label: ${label}`);
    return;
  }

  const documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.setProperty("HEVY_API_KEY", storedKey);
  documentProperties.deleteProperty("LAST_WORKOUT_UPDATE");

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Switched to API key: ${label}`,
    "Developer Mode",
    TOAST_DURATION.NORMAL
  );

  apiClient.runFullImport();
}

/**
 * Removes an API key from the script properties
 * @param {string} label - The label of the API key to remove
 */
function removeApiKey(label) {
  PropertiesService.getScriptProperties().deleteProperty(
    getDevApiKeyPropertyKey(label)
  );
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `API Key "${label}" removed.`,
    "Developer Action",
    TOAST_DURATION.NORMAL
  );
}

/**
 * Retrieves all stored API keys and the current one for UI display
 * @returns {Object} Object containing all stored API keys and the current one
 */
function getApiKeyDataForUI() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys = Object.entries(props)
    .filter(([key]) => key.startsWith(DEV_API_KEY_PREFIX))
    .map(([key, value]) => ({
      label: key.replace(DEV_API_KEY_PREFIX, ""),
      key: value,
    }));
  const current =
    PropertiesService.getDocumentProperties().getProperty("HEVY_API_KEY");
  return { keys, current };
}

/**
 * Trigger Management
 */

/**
 * Runs the automatic import process
 * This is the function called by the triggers
 * @returns {Promise<void>}
 */
async function runAutomaticImport() {
  // Check for API key first - return early if not set
  const properties = getDocumentProperties();
  const apiKey = properties?.getProperty("HEVY_API_KEY");

  if (!apiKey) {
    // No API key set - return early without attempting import
    // Don't show toast to avoid spam on every spreadsheet open
    return;
  }

  try {
    await importAllExercises();

    if (
      SpreadsheetApp.getActiveSpreadsheet().getId() !== TEMPLATE_SPREADSHEET_ID
    ) {
      Utilities.sleep(RATE_LIMIT.API_DELAY);
      if ((await importAllWorkouts()) > 0) {
        Utilities.sleep(RATE_LIMIT.API_DELAY);
        await importAllRoutineFolders();
        Utilities.sleep(RATE_LIMIT.API_DELAY);
        await importAllRoutines();
      }
    }

    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Importing all data completed successfully",
      "Automatic Import",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    ErrorHandler.handle(error, { operation: "Running import on open" }, false);
  }
}

/**
 * Developer Check
 */

/**
 * Checks if the current user is a developer
 * @returns {boolean} True if user is a developer
 */
function isDeveloper() {
  const email = Session.getEffectiveUser().getEmail();
  const developerEmails = ["gelbharttomer@gmail.com"];
  return developerEmails.includes(email);
}

/**
 * Multi-Login Check
 */

/**
 * Checks if the user might be experiencing multi-login issues and shows a warning
 * @private
 */
function checkForMultiLoginIssues() {
  try {
    const effectiveUser = Session.getEffectiveUser().getEmail();
    const activeUser = Session.getActiveUser().getEmail();

    if (!activeUser || activeUser !== effectiveUser) {
      showMultiLoginWarning();
      return true;
    }

    return false;
  } catch (error) {
    showMultiLoginWarning();
    return true;
  }
}
