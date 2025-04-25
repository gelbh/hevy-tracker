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
        .addItem("⚖️ Log Body Weight", "logWeight")
        .addSeparator()
        .addItem("⚙️ Weight Unit Settings", "showWeightUnitDialog");
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
      showWeightUnitDialog: () => ({
        handler: showWeightUnitDialog,
        successMessage: "Weight unit settings opened",
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

    return result !== ui.Button.NO;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing multi-login warning",
    });
  }
}

function showWeightUnitDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/WeightUnitDialog", {
      width: 400,
      height: 300,
      title: "Weight Unit Preference",
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing weight unit dialog",
    });
  }
}

function setWeightUnitAndRefresh(unit) {
  try {
    setWeightUnit(unit);
    refreshWeightDisplays();
    addWeightUnitTooltips();

    showProgress(
      `Weight unit preference set to ${unit}`,
      "Settings Updated",
      TOAST_DURATION.NORMAL
    );
    return true;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Setting weight unit",
      unit: unit,
    });
  }
}

function refreshWeightDisplays() {
  try {
    // Array of sheets to refresh
    const sheetsToRefresh = [
      WORKOUTS_SHEET_NAME,
      ROUTINES_SHEET_NAME,
      WEIGHT_SHEET_NAME,
      "Routine Builder", // Include the Routine Builder if it exists
    ];

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Process each sheet
    sheetsToRefresh.forEach((sheetName) => {
      const sheet = ss.getSheetByName(sheetName);
      if (sheet) {
        // For standard sheets, use the SheetManager
        if (SHEET_HEADERS[sheetName]) {
          const manager = new SheetManager(sheet, sheetName);
          manager.formatSheet();
        } else {
          // For Routine Builder, just reformat any weight cells
          updateRoutineBuilderWeightFormat(sheet);
        }
      }
    });

    // Show user the unit in the header
    updateSheetHeadersWithUnit();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Refreshing weight displays",
    });
  }
}

// Helper function to update weight displays in Routine Builder
function updateRoutineBuilderWeightFormat(sheet) {
  try {
    if (!sheet) return;

    // Find the weight column in the Routine Builder (typically column D)
    const headers = sheet.getRange("A7:H7").getValues()[0];
    let weightColumnIndex = -1;

    for (let i = 0; i < headers.length; i++) {
      if (headers[i] === "Weight (kg)") {
        weightColumnIndex = i;

        // Update the header to show the current unit
        const unit = getWeightUnit();
        sheet.getRange(7, i + 1).setValue(`Weight (${unit})`);
        break;
      }
    }

    if (weightColumnIndex === -1) return;

    // No need to modify the values, just ensure the header shows the right unit
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating routine builder weight format",
    });
  }
}

// Update sheet headers to show the current unit
function updateSheetHeadersWithUnit() {
  try {
    const unit = getWeightUnit();
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Update headers in standard sheets
    Object.entries(SHEET_HEADERS).forEach(([sheetName, headers]) => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      // Find weight columns
      headers.forEach((header, index) => {
        if (header.includes("Weight (")) {
          const newHeader = `Weight (${unit})`;
          sheet.getRange(1, index + 1).setValue(newHeader);
        }
      });
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Updating sheet headers with unit",
    });
  }
}
