/**
 * Dialog management for the Hevy Tracker add-on
 * @module Dialogs
 */

/**
 * Shows initial setup dialog and handles authorization
 */
const showInitialSetup = () => {
  try {
    const hasApiKey = getDocumentProperties()?.getProperty("HEVY_API_KEY");

    if (hasApiKey) {
      apiClient.manageApiKey();
    } else {
      showHtmlDialog("ui/dialogs/SetApiKey", {
        width: DIALOG_DIMENSIONS.API_KEY_WIDTH,
        height: DIALOG_DIMENSIONS.API_KEY_HEIGHT,
      });
    }
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing initial setup" });
  }
};

/**
 * Shows the setup guide dialog
 */
const showGuideDialog = () => {
  try {
    showHtmlDialog("ui/dialogs/SetupInstructions", {
      width: DIALOG_DIMENSIONS.SETUP_INSTRUCTIONS_WIDTH,
      height: DIALOG_DIMENSIONS.SETUP_INSTRUCTIONS_HEIGHT,
      templateData: {
        TEMPLATE_SPREADSHEET_ID: TEMPLATE_SPREADSHEET_ID,
      },
    });
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing guide dialog" });
  }
};

/**
 * Opens the Takeout-import dialog
 */
const showTakeoutDialog = () => {
  try {
    showHtmlDialog("ui/dialogs/ImportWeight", {
      width: DIALOG_DIMENSIONS.IMPORT_WEIGHT_WIDTH,
      height: DIALOG_DIMENSIONS.IMPORT_WEIGHT_HEIGHT,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing import dialog" });
  }
};

/**
 * Shows a warning dialog about multi-login issues
 */
function showMultiLoginWarning() {
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.alert(
      "Multi-Account Login Detected",
      "You appear to be logged into multiple Google accounts simultaneously. " +
        "This can cause issues with the Hevy Tracker add-on.\n\n" +
        "For best results:\n" +
        "1. Log out of all Google accounts\n" +
        "2. Log in only with the account that has access to this spreadsheet\n" +
        "3. Or use an incognito/private browsing window with just one account\n\n" +
        "Would you like to continue anyway?",
      ui.ButtonSet.YES_NO
    );

    return result !== ui.Button.NO;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing multi-login warning",
    });
  }
}

/**
 * Shows the Developer API Key Manager dialog
 */
const showDevApiManagerDialog = () => {
  showHtmlDialog("ui/dialogs/DevApiManager", {
    width: DIALOG_DIMENSIONS.DEV_API_MANAGER_WIDTH,
    height: DIALOG_DIMENSIONS.DEV_API_MANAGER_HEIGHT,
  });
};
