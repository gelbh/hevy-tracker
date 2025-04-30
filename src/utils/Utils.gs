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

/**
 * Updates chart titles to reflect the current weight unit
 * @param {string} unit - The weight unit
 */
function updateChartTitles(unit) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const mainSheet = ss.getSheetByName("Main");
    let charts = mainSheet.getCharts();
    for (let i = 0; i < charts.length; i++) {
      const chart = charts[i];
      let options = chart.getOptions();
      let oldTitle = options.get("title");
      if (oldTitle && oldTitle.toString().includes("Volume")) {
        const newChart = chart
          .modify()
          .setOption("title", `Volume (${unit})`)
          .build();
        mainSheet.updateChart(newChart);
      }
    }

    SpreadsheetApp.flush();
    showProgress(
      `Weight unit changed to ${unit}`,
      "Settings Updated",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating chart titles",
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

// -----------------
// Trigger Management
// -----------------

/**
 * Sets up automatic import triggers to run twice daily
 * Only configures triggers if they don't already exist
 */
function setupAutomaticImportTriggers() {
  try {
    if (doImportTriggersExist()) {
      return;
    }

    ScriptApp.newTrigger("runAutomaticImport")
      .timeBased()
      .atHour(6)
      .everyDays(1)
      .create();

    ScriptApp.newTrigger("runAutomaticImport")
      .timeBased()
      .atHour(18)
      .everyDays(1)
      .create();

    const properties = getUserProperties();
    if (properties) {
      properties.setProperty("AUTO_IMPORT_ENABLED", "true");
    }

    console.log("Automatic import triggers set up successfully");
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Setting up automatic import triggers",
    });
  }
}

/**
 * Runs the automatic import process
 * This is the function called by the triggers
 */
function runAutomaticImport() {
  try {
    const properties = getUserProperties();
    if (
      !properties ||
      properties.getProperty("AUTO_IMPORT_ENABLED") !== "true"
    ) {
      return;
    }

    importAllWorkouts();

    console.log(`Automatic import completed at ${new Date().toISOString()}`);
  } catch (error) {
    ErrorHandler.handle(
      error,
      {
        operation: "Running automatic import",
      },
      false
    );
  }
}

/**
 * Checks if import triggers already exist
 * @returns {boolean} True if triggers exist
 * @private
 */
function doImportTriggersExist() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    return triggers.some(
      (trigger) =>
        trigger.getHandlerFunction() === "runAutomaticImport" &&
        trigger.getEventType() === ScriptApp.EventType.CLOCK
    );
  } catch (error) {
    console.error("Error checking triggers:", error);
    return false;
  }
}

/**
 * Removes all automatic import triggers
 * Call this when user wants to disable auto-imports
 */
function removeAutomaticImportTriggers() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach((trigger) => {
      if (trigger.getHandlerFunction() === "runAutomaticImport") {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    const properties = getUserProperties();
    if (properties) {
      properties.setProperty("AUTO_IMPORT_ENABLED", "false");
    }

    console.log("Automatic import triggers removed");
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Removing automatic import triggers",
    });
  }
}
