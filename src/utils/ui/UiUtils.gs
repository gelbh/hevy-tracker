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
 * @private
 */
const createHtmlOutput = (filename, templateData) => {
  const template = HtmlService.createTemplateFromFile(filename);
  if (Object.keys(templateData).length > 0) {
    Object.assign(template, templateData);
  }
  return template.evaluate();
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
  if (showAsSidebar) {
    htmlOutput.setWidth(width);
    ui.showSidebar(htmlOutput);
  } else {
    htmlOutput.setWidth(width).setHeight(height);
    ui.showModalDialog(htmlOutput, title);
  }
};
