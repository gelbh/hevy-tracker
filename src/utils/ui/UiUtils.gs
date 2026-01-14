/**
 * UI Utilities
 * Provides HTML dialog creation and display functionality
 * @module ui/UiUtils
 */

/**
 * @typedef {Object} HtmlDialogOptions
 * @property {number} [width] - Dialog width in pixels
 * @property {number} [height] - Dialog height in pixels
 * @property {string} [title] - Dialog title
 * @property {Object} [templateData] - Data to pass to the template
 * @property {boolean} [showAsSidebar] - Whether to show as sidebar instead of modal
 */

/**
 * Creates and shows an HTML dialog from a template file
 * @param {string} filename - Name of the HTML template file (without .html extension)
 * @param {HtmlDialogOptions} [options={}] - Configuration options
 * @throws {Error} If dialog creation or display fails
 * @example
 * showHtmlDialog("ui/dialogs/SetApiKey", {
 *   width: 450,
 *   height: 250,
 *   title: "API Key Setup"
 * });
 */
function showHtmlDialog(filename, options = {}) {
  const {
    width = DIALOG_DIMENSIONS.DEFAULT_WIDTH,
    height = DIALOG_DIMENSIONS.DEFAULT_HEIGHT,
    title = "",
    templateData = {},
    showAsSidebar = false,
  } = options;

  try {
    const html = createHtmlOutput(filename, templateData);
    const htmlOutput = configureHtmlOutput(html, filename, title);
    const dialogTitle = title || "\u00A0";
    showDialog(htmlOutput, width, height, showAsSidebar, dialogTitle);
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
 * Always uses template processing to support <?!= ... ?> syntax for includes
 * @param {string} filename - Name of the HTML template file
 * @param {Object} templateData - Data to pass to the template
 * @returns {GoogleAppsScript.HTML.HtmlOutput} Evaluated HTML output
 * @throws {Error} If template file cannot be accessed or created
 * @private
 */
const createHtmlOutput = (filename, templateData) => {
  try {
    const template = HtmlService.createTemplateFromFile(filename);
    if (Object.keys(templateData).length > 0) {
      Object.assign(template, templateData);
    }
    return template.evaluate();
  } catch (error) {
    // Check if this is a Drive file access permission error
    const errorMessage = error?.message?.toLowerCase() ?? "";
    if (
      errorMessage.includes("unable to access file") ||
      errorMessage.includes("permission") ||
      errorMessage.includes("access denied") ||
      errorMessage.includes("file not found") ||
      errorMessage.includes("drive")
    ) {
      // Enhance error with context about Drive permissions
      const enhancedError = new Error(
        `Unable to access HTML template file "${filename}". ` +
          "This may be due to Drive permission restrictions. " +
          "Please ensure the add-on has been authorized with Drive file access permissions."
      );
      enhancedError.originalError = error;
      enhancedError.filename = filename;
      enhancedError.isDrivePermissionError = true;
      throw enhancedError;
    }
    // Re-throw other errors as-is
    throw error;
  }
};

/**
 * Configures HTML output with standard settings
 * @private
 */
const configureHtmlOutput = (html, filename, title) =>
  html
    .setTitle(title || filename)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);

/**
 * Shows the configured dialog
 * @private
 */
const showDialog = (htmlOutput, width, height, showAsSidebar, title) => {
  const ui = SpreadsheetApp.getUi();
  try {
    if (showAsSidebar) {
      htmlOutput.setWidth(width);
      ui.showSidebar(htmlOutput);
    } else {
      htmlOutput.setWidth(width).setHeight(height);
      ui.showModalDialog(htmlOutput, title);
    }
  } catch (error) {
    // Check if this is a UI permission error
    const errorMessage = error?.message ?? "";
    const errorString = error?.toString() ?? "";
    const fullErrorText = (errorMessage + " " + errorString).toLowerCase();

    const isUiPermissionError =
      errorMessage.includes("Ui.showModalDialog") ||
      errorMessage.includes("Ui.showSidebar") ||
      errorMessage.includes("script.container.ui") ||
      (fullErrorText.includes("permission") &&
        (fullErrorText.includes("ui") ||
          fullErrorText.includes("script.container.ui") ||
          fullErrorText.includes("showmodaldialog") ||
          fullErrorText.includes("showsidebar"))) ||
      (errorMessage.includes("permission") && errorMessage.includes("Ui")) ||
      errorMessage.includes("You do not have permission to call");

    if (isUiPermissionError) {
      try {
        ui.alert(
          "Additional Permission Required",
          "The Hevy Tracker add-on needs additional permissions to display dialogs.\n\n" +
            "To fix this:\n" +
            "1. Use any menu item in Extensions → Hevy Tracker (this will trigger re-authorization)\n" +
            "2. Or go to Extensions → Add-ons → Manage add-ons → Hevy Tracker → Options → Re-authorize\n" +
            "3. Or uninstall and reinstall the add-on from the Marketplace\n\n" +
            "After re-authorization, the dialogs will work correctly.",
          ui.ButtonSet.OK
        );
      } catch (alertError) {
        try {
          const ss = SpreadsheetApp.getActiveSpreadsheet();
          if (ss) {
            ss.toast(
              "Please use Extensions → Hevy Tracker → Set Hevy API Key to configure the add-on. Re-authorization may be required.",
              "Setup Required",
              TOAST_DURATION.LONG
            );
          }
        } catch (toastError) {
          console.error(
            "Failed to show UI permission error notification:",
            toastError
          );
        }
      }
      // Re-throw the error so it can be logged by ErrorHandler
      throw error;
    }
    // Re-throw other errors
    throw error;
  }
};
