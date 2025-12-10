/**
 * Core menu functionality for the Hevy Tracker add-on
 * @module Menu
 */

/**
 * Wrapper function for menu item to run full import
 * @returns {Promise<void>}
 */
async function runFullImport() {
  return getApiClient().runFullImport();
}

/**
 * Triggers when the add-on is installed
 * @param {Object} e - The event object
 */
function onInstall(e) {
  try {
    onOpen(e);
  } catch (error) {
    throw ErrorHandler.handle(error, { operation: "Installing add-on" });
  }
}

/**
 * Creates developer menu items
 * @param {GoogleAppsScript.Base.Menu} menu - The menu to add items to
 * @param {boolean} isTemplate - Whether this is the template spreadsheet
 * @private
 */
const addDeveloperMenuItems = (menu, isTemplate) => {
  menu
    .addItem("🔧 Developer API Manager", "showDevApiManagerDialog")
    .addSeparator();
  if (isTemplate) {
    menu.addItem("💪 Import Exercises", "importAllExercises").addSeparator();
  }
};

/**
 * Creates import submenu
 * @param {GoogleAppsScript.Base.Ui} ui - The UI object
 * @returns {GoogleAppsScript.Base.Menu} Import submenu
 * @private
 */
const createImportSubmenu = (ui) => {
  const submenu = ui
    .createMenu("📥 Import Data")
    .addItem("📥 Import All", "runFullImport")
    .addSeparator()
    .addItem("🏋️ Import Workouts", "importAllWorkouts")
    .addItem("💪 Import Exercises", "importAllExercises")
    .addItem("📋 Import Routines", "importAllRoutines")
    .addItem("📁 Import Routine Folders", "importAllRoutineFolders");

  // Add deferred post-processing option if there are deferred operations
  // Wrap in try-catch to prevent timeout in simple trigger
  try {
    const deferredOps = ImportProgressTracker.getDeferredOperations();
    if (deferredOps && deferredOps.length > 0) {
      submenu
        .addSeparator()
        .addItem(
          `🔄 Complete Post-Processing (${deferredOps.length})`,
          "runDeferredPostProcessing"
        );
    }
  } catch (error) {
    // Non-blocking: log warning but don't prevent menu creation
    console.warn(
      "Failed to check deferred operations during menu creation:",
      error
    );
  }

  return submenu;
};

/**
 * Creates routine builder submenu
 * @param {GoogleAppsScript.Base.Ui} ui - The UI object
 * @returns {GoogleAppsScript.Base.Menu} Routine builder submenu
 * @private
 */
const createRoutineBuilderSubmenu = (ui) =>
  ui
    .createMenu("📝 Routine Builder")
    .addItem("📋 Create Routine from Sheet", "createRoutineFromSheet")
    .addItem("🗑️ Clear Builder Form", "clearRoutineBuilder");

/**
 * Creates a custom menu in the Google Sheets UI when the spreadsheet is opened
 * @param {Object} e - The event object
 */
function onOpen(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    const addonMenu = ui.createAddonMenu();
    const isTemplate = e?.source?.getId() === TEMPLATE_SPREADSHEET_ID;

    if (isDeveloper()) {
      addDeveloperMenuItems(addonMenu, isTemplate);
    }

    if (isTemplate) {
      addonMenu.addItem("❓ View Setup Guide", "showGuideDialog");
    } else {
      addonMenu.addItem("🔑 Set Hevy API Key", "showInitialSetup");
    }

    if (!isTemplate) {
      addonMenu
        .addSeparator()
        .addSubMenu(createImportSubmenu(ui))
        .addSeparator()
        .addSubMenu(createRoutineBuilderSubmenu(ui))
        .addSeparator()
        .addItem("❤️‍🩹 Import Body Weight from Takeout", "showTakeoutDialog")
        .addItem("⚖️ Log Body Weight", "logWeight");
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
    checkForMultiLoginIssues();

    const spreadsheet = SpreadsheetApp.getActive();
    const isTemplate = spreadsheet.getId() === TEMPLATE_SPREADSHEET_ID;

    const template = HtmlService.createTemplateFromFile("ui/dialogs/Sidebar");
    template.data = {
      isTemplate,
      timestamp: new Date().getTime(),
    };

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
 * Template spreadsheet URL for user reference
 * @type {string}
 * @private
 */
const TEMPLATE_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_SPREADSHEET_ID}`;

/**
 * Shows an alert dialog when required sheets are missing
 * @param {string} title - Alert title
 * @param {string} message - Alert message (without template URL)
 * @private
 */
function _showMissingSheetAlert(title, message) {
  const ui = SpreadsheetApp.getUi();
  ui.alert(title, `${message}\n\nTemplate: ${TEMPLATE_URL}`, ui.ButtonSet.OK);
}

/**
 * Handles spreadsheet edit events and triggers appropriate actions
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The onEdit event object
 */
function onEdit(e) {
  try {
    if (!e?.range) {
      return;
    }

    const range = e.range;
    const sheetName = getSheetNameFromRange(range);
    const cell = range.getA1Notation();

    if (!sheetName) {
      _showMissingSheetAlert(
        "Sheet Not Found",
        "A required sheet appears to have been deleted. Please create a new copy of the template spreadsheet to restore all required sheets."
      );
      return;
    }

    if (sheetName !== "Main" || !["I5", "S16", "T16"].includes(cell)) {
      return;
    }

    const spreadsheet = getActiveSpreadsheet();
    const mainSheet = spreadsheet.getSheetByName("Main");
    const dataSheet = spreadsheet.getSheetByName("Data");

    if (!mainSheet || !dataSheet) {
      const missingSheets = [];
      if (!mainSheet) missingSheets.push('"Main"');
      if (!dataSheet) missingSheets.push('"Data"');

      _showMissingSheetAlert(
        "Required Sheets Missing",
        `The following required sheet(s) are missing: ${missingSheets.join(
          ", "
        )}.\n\nPlease create a new copy of the template spreadsheet to restore all required sheets.`
      );
      return;
    }

    let lastRow;
    try {
      lastRow = dataSheet.getLastRow();
    } catch (error) {
      _showMissingSheetAlert(
        "Sheet Error",
        "The 'Data' sheet appears to have been deleted or is no longer accessible. Please create a new copy of the template spreadsheet to restore all required sheets."
      );
      return;
    }

    if (cell === "I5" && e.value) {
      try {
        const format = `#,##0 "${e.value}"`;
        const rangeList = dataSheet.getRangeList([
          `J4:J${lastRow}`,
          `E4:E${lastRow}`,
        ]);
        rangeList.setNumberFormat(format);
      } catch (error) {
        _showMissingSheetAlert(
          "Sheet Error",
          "The 'Data' sheet appears to have been deleted or is no longer accessible. Please create a new copy of the template spreadsheet to restore all required sheets."
        );
      }
      return;
    }

    if (cell === "S16" || cell === "T16") {
      try {
        const s16 = mainSheet.getRange("S16").getValue();
        const t16 = mainSheet.getRange("T16").getValue();
        const monthly = s16 === "Monthly" && t16 === "Calendar";
        const yearly = s16 === "Yearly" && t16 === "Calendar";
        const format = monthly ? "mmm 'yy" : yearly ? "yyyy" : "dd/mm/yyyy";
        dataSheet.getRange(`M4:M${lastRow}`).setNumberFormat(format);
      } catch (error) {
        _showMissingSheetAlert(
          "Sheet Error",
          "A required sheet appears to have been deleted or is no longer accessible. Please create a new copy of the template spreadsheet to restore all required sheets."
        );
      }
    }
  } catch (error) {
    let sheetName = null;
    let cellNotation = null;
    try {
      if (e?.range) {
        sheetName = getSheetNameFromRange(e.range);
        cellNotation = e.range.getA1Notation();
      }
    } catch (innerError) {
      // Ignore errors when extracting context for error reporting
    }

    throw ErrorHandler.handle(error, {
      operation: "Handling edit event",
      sheetName: sheetName,
      cellNotation: cellNotation,
    });
  }
}

/**
 * Action map for menu actions
 * @type {Object<string, Object>}
 * @private
 */
const MENU_ACTIONS = {
  showInitialSetup: {
    handler: showInitialSetup,
    message: "API key setup initiated",
  },
  runFullImport: {
    handler: () => getApiClient().runFullImport(),
    message: "Import started",
  },
  importAllWorkouts: {
    handler: importAllWorkouts,
    message: "Workouts import initiated",
  },
  importAllExercises: {
    handler: importAllExercises,
    message: "Exercises import initiated",
  },
  importAllRoutines: {
    handler: importAllRoutines,
    message: "Routines import initiated",
  },
  importAllRoutineFolders: {
    handler: importAllRoutineFolders,
    message: "Folders import initiated",
  },
  createRoutineFromSheet: {
    handler: createRoutineFromSheet,
    message: "Creating routine",
  },
  clearRoutineBuilder: {
    handler: clearRoutineBuilder,
    message: "Form cleared",
  },
  logWeight: { handler: logWeight, message: "Weight logging initiated" },
  showGuideDialog: { handler: showGuideDialog, message: "Opening guide" },
  showTakeoutDialog: {
    handler: showTakeoutDialog,
    message: "Weight import initiated",
  },
  runDeferredPostProcessing: {
    handler: runDeferredPostProcessing,
    message: "Post-processing initiated",
  },
};

/**
 * Handles sidebar menu actions with improved response handling
 * @param {string} action - The action to perform
 * @returns {Object} Response object with status and message
 */
function runMenuAction(action) {
  try {
    const actionConfig = MENU_ACTIONS[action];
    if (!actionConfig) {
      throw new Error(`Unknown action: ${action}`);
    }

    actionConfig.handler();
    return {
      success: true,
      message: actionConfig.message,
    };
  } catch (error) {
    ErrorHandler.handle(error, {
      operation: "Running menu action",
      action,
    });
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Operation handlers for deferred post-processing
 * @type {Object<string, Function>}
 * @private
 */
const DEFERRED_OPERATION_HANDLERS = {
  syncLocalizedExerciseNames: async (checkTimeout) => {
    await syncLocalizedExerciseNames(null, checkTimeout);
  },
  updateExerciseCounts: async (checkTimeout) => {
    const ss = getActiveSpreadsheet();
    const exerciseSheet = ss.getSheetByName(EXERCISES_SHEET_NAME);
    if (exerciseSheet) {
      await updateExerciseCounts(exerciseSheet, checkTimeout);
    }
  },
};

/**
 * Runs deferred post-processing operations that timed out during import
 * This allows users to manually complete operations like syncing localized names
 * and updating exercise counts
 */
async function runDeferredPostProcessing() {
  try {
    const deferredOps = ImportProgressTracker.getDeferredOperations();

    if (deferredOps.length === 0) {
      getActiveSpreadsheet().toast(
        "No deferred post-processing operations found.",
        "Nothing to Complete",
        TOAST_DURATION.NORMAL
      );
      return;
    }

    const ss = getActiveSpreadsheet();
    ss.toast(
      `Completing ${deferredOps.length} deferred operation(s)...`,
      "Post-Processing",
      TOAST_DURATION.SHORT
    );

    const checkTimeout = () => false; // No timeout for manual runs

    for (const operation of deferredOps) {
      try {
        const handler = DEFERRED_OPERATION_HANDLERS[operation];
        if (handler) {
          await handler(checkTimeout);
          ss.toast(
            `Completed: ${operation}`,
            "Post-Processing",
            TOAST_DURATION.SHORT
          );
        }
      } catch (error) {
        console.error(`Failed to complete ${operation}:`, error);
        // Continue with other operations even if one fails
      }
    }

    ss.toast(
      "All deferred post-processing operations completed!",
      "Post-Processing Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Running deferred post-processing",
    });
  }
}
