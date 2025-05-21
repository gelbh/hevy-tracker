/**
 * Dialogs
 */

/**
 * Shows initial setup dialog and handles authorization
 */
function showInitialSetup() {
  try {
    const properties = getDocumentProperties();
    const hasApiKey = properties && properties.getProperty("HEVY_API_KEY");

    if (hasApiKey) {
      apiClient.manageApiKey();
    } else {
      showHtmlDialog("src/ui/dialogs/SetApiKey", {
        width: 450,
        height: 250,
        title: "Hevy Tracker Setup",
      });
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing initial setup",
    });
  }
}

/**
 * Shows the setup guide dialog
 */
function showGuideDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/SetupInstructions", {
      width: 700,
      height: 700,
      title: "Hevy Tracker Setup Guide",
      templateData: {
        TEMPLATE_SPREADSHEET_ID: TEMPLATE_SPREADSHEET_ID,
      },
    });
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Showing guide dialog" });
  }
}

/**
 * Opens the Takeout-import dialog.
 */
function showTakeoutDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/ImportWeight", {
      title: "Import Google Fit Weight",
      width: 600,
      height: 420,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing import dialog",
    });
  }
}

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
 * Show the Developer API Key Manager dialog
 */
function showDevApiManagerDialog() {
  showHtmlDialog("src/ui/dialogs/DevApiManager", {
    width: 600,
    height: 450,
    title: "Developer API Key Manager",
  });
}
