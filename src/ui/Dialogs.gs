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
      getApiClient().manageApiKey();
    } else {
      showHtmlDialog("ui/dialogs/SetApiKey", {
        width: DIALOG_DIMENSIONS.API_KEY_WIDTH,
        height: DIALOG_DIMENSIONS.API_KEY_HEIGHT,
      });
    }
  } catch (error) {
    // Check if this is a Drive permission error from HTML dialog or file access
    const message = error?.message?.toLowerCase() ?? "";
    const isDrivePermissionError =
      error instanceof DrivePermissionError ||
      error?.isDrivePermissionError === true ||
      (message.includes("unable to access file") && message.includes("drive"));

    if (isDrivePermissionError) {
      // Show user-friendly alert with instructions
      const ui = SpreadsheetApp.getUi();
      ui.alert(
        "Drive Permission Required",
        "The Hevy Tracker add-on needs Drive file access permissions to display setup dialogs.\n\n" +
          "To fix this:\n" +
          "1. Use any menu item in Extensions → Hevy Tracker (this will trigger re-authorization)\n" +
          "2. Or go to Extensions → Add-ons → Manage add-ons → Hevy Tracker → Options → Re-authorize\n" +
          "3. Ensure you have edit access to this spreadsheet\n" +
          "4. If the issue persists, try uninstalling and reinstalling the add-on\n\n" +
          "After re-authorization, you can set your API key using the menu.",
        ui.ButtonSet.OK
      );

      // Log the error without showing an additional toast, then exit gracefully
      ErrorHandler.handle(
        error,
        { operation: "Showing initial setup", uiAlertShown: true },
        false
      );
      return;
    }

    // Non-permission errors should still be surfaced and logged as failures
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

/**
 * Shows the Load Routine dialog for selecting a routine to edit
 */
const showLoadRoutineDialog = () => {
  try {
    showHtmlDialog("ui/dialogs/LoadRoutine", {
      width: DIALOG_DIMENSIONS.LOAD_ROUTINE_WIDTH,
      height: DIALOG_DIMENSIONS.LOAD_ROUTINE_HEIGHT,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing load routine dialog",
    });
  }
};

/**
 * Gets import progress data for the continue import dialog
 * @returns {Object} Object containing completedSteps, remainingSteps, and stepLabels
 */
function getContinueImportData() {
  try {
    const progress = ImportProgressTracker.loadProgress();
    const completedSteps = progress?.completedSteps ?? [];
    const remainingSteps = ImportProgressTracker.getRemainingSteps();

    return {
      completedSteps,
      remainingSteps,
    };
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Getting continue import data",
    });
  }
}

/**
 * Shows the continue import dialog when import is interrupted
 */
function showContinueImportDialog() {
  try {
    showHtmlDialog("ui/dialogs/ContinueImport", {
      width: DIALOG_DIMENSIONS.CONTINUE_IMPORT_WIDTH,
      height: DIALOG_DIMENSIONS.CONTINUE_IMPORT_HEIGHT,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing continue import dialog",
    });
  }
}
