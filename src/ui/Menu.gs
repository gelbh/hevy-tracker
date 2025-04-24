/**
 * Core menu functionality for the Hevy Tracker add-on
 */

/**
 * Triggers when the add-on is installed
 * @param {Object} e The event object
 */
function onInstall(e) {
  try {
    onOpen(e);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Installing add-on",
    });
  }
}

/**
 * Creates a custom menu in the Google Sheets UI when the spreadsheet is opened
 * @param {Object} e The event object
 */
function onOpen(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    const addonMenu = ui.createAddonMenu();

    const isTemplate =
      e?.source?.getId() === "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

    if (isTemplate) {
      addonMenu.addItem("❓ View Setup Guide", "showGuideDialog");
    } else {
      addonMenu.addItem("🔑 Set Hevy API Key", "showInitialSetup");
    }

    checkForMultiLoginIssues();

    if (!isTemplate) {
      const importSubmenu = ui
        .createMenu("📥 Import Data")
        .addItem("📥 Import All", "apiClient.runInitialImport")
        .addSeparator()
        .addItem("🏋️ Import Workouts", "importAllWorkouts")
        .addItem("💪 Import Exercises", "importAllExercises")
        .addItem("📋 Import Routines", "importAllRoutines")
        .addItem("📁 Import Routine Folders", "importAllRoutineFolders");

      const routineBuilderSubmenu = ui
        .createMenu("📝 Routine Builder")
        .addItem("📋 Create Routine from Sheet", "createRoutineFromSheet")
        .addItem("🗑️ Clear Builder Form", "clearRoutineBuilder");

      addonMenu
        .addSeparator()
        .addSubMenu(importSubmenu)
        .addSeparator()
        .addSubMenu(routineBuilderSubmenu)
        .addSeparator()
        .addItem("⚖️ Log Weight", "logWeight");
    }

    addonMenu.addToUi();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Opening spreadsheet",
      authMode: e?.authMode,
    });
  }
}

/**
 * Function that runs when the add-on opens in the sidebar
 * @param {Object} e The event object
 */
function onHomepage(e) {
  try {
    const spreadsheet = SpreadsheetApp.getActive();
    const isTemplate =
      spreadsheet.getId() === "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

    const template = HtmlService.createTemplateFromFile(
      "src/ui/dialogs/Sidebar"
    );
    template.data = { isTemplate };

    const htmlOutput = template
      .evaluate()
      .setTitle("Hevy Tracker")
      .setWidth(300)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1");

    SpreadsheetApp.getUi().showSidebar(htmlOutput);
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Opening homepage",
      eventType: e?.type,
    });
  }
}

/**
 * Shows initial setup dialog and handles authorization
 */
function showInitialSetup() {
  try {
    const properties = getUserProperties();
    const hasApiKey = properties && properties.getProperty("HEVY_API_KEY");

    if (hasApiKey) {
      apiClient.manageHevyApiKey();
    } else {
      showHtmlDialog("src/ui/dialogs/ApiKeyDialog", {
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
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing guide dialog",
    });
  }
}

/**
 * Handles sidebar menu actions with improved response handling
 * @param {string} action - The action to perform
 * @returns {Object} Response object with status and message
 */
function runMenuAction(action) {
  try {
    const actionMap = {
      showInitialSetup: () => ({
        handler: showInitialSetup,
        successMessage: "API key setup initiated",
      }),
      runInitialImport: () => ({
        handler: apiClient.runInitialImport,
        successMessage: "Import started",
      }),
      importAllWorkouts: () => ({
        handler: importAllWorkouts,
        successMessage: "Workouts import initiated",
      }),
      importAllExercises: () => ({
        handler: importAllExercises,
        successMessage: "Exercises import initiated",
      }),
      importAllRoutines: () => ({
        handler: importAllRoutines,
        successMessage: "Routines import initiated",
      }),
      importAllRoutineFolders: () => ({
        handler: importAllRoutineFolders,
        successMessage: "Folders import initiated",
      }),
      createRoutineFromSheet: () => ({
        handler: createRoutineFromSheet,
        successMessage: "Creating routine",
      }),
      clearRoutineBuilder: () => ({
        handler: clearRoutineBuilder,
        successMessage: "Form cleared",
      }),
      logWeight: () => ({
        handler: logWeight,
        successMessage: "Weight logging initiated",
      }),
      showGuideDialog: () => ({
        handler: showGuideDialog,
        successMessage: "Opening guide",
      }),
    };

    if (action in actionMap) {
      const { handler, successMessage } = actionMap[action]();
      handler();
      return {
        success: true,
        message: successMessage,
      };
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    ErrorHandler.handle(error, {
      operation: "Running menu action",
      action: action,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

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

/**
 * Shows a warning dialog about multi-login issues
 * @private
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

    if (result === ui.Button.NO) {
      // User chose to fix the issue first
      return false;
    }

    return true;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing multi-login warning",
    });
  }
}
