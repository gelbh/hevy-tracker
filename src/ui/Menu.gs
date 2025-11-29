/**
 * Core menu functionality for the Hevy Tracker add-on
 * @module Menu
 */

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
    .addItem("📥 Import All", "apiClient.runFullImport")
    .addSeparator()
    .addItem("🏋️ Import Workouts", "importAllWorkouts")
    .addItem("💪 Import Exercises", "importAllExercises")
    .addItem("📋 Import Routines", "importAllRoutines")
    .addItem("📁 Import Routine Folders", "importAllRoutineFolders");

  // Add deferred post-processing option if there are deferred operations
  const deferredOps = ImportProgressTracker.getDeferredOperations();
  if (deferredOps.length > 0) {
    submenu
      .addSeparator()
      .addItem(
        `🔄 Complete Post-Processing (${deferredOps.length})`,
        "runDeferredPostProcessing"
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
 * Handles spreadsheet edit events and triggers appropriate actions
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The onEdit event object
 */
function onEdit(e) {
  try {
    if (!e?.range) {
      return;
    }

    const range = e.range;
    const sheetName = range.getSheet()?.getName();
    const cell = range.getA1Notation();

    if (sheetName !== "Main" || !["I5", "S16", "T16"].includes(cell)) {
      return;
    }

    // Cache spreadsheet and sheet references to avoid repeated service calls
    const sheet = getActiveSpreadsheet();
    const mainSheet = sheet.getSheetByName("Main");
    const dataSheet = sheet.getSheetByName("Data");
    const lastRow = dataSheet.getLastRow();

    if (cell === "I5" && e.value) {
      const format = `#,##0 "${e.value}"`;
      const rangeList = dataSheet.getRangeList([
        `J4:J${lastRow}`,
        `E4:E${lastRow}`,
      ]);
      rangeList.setNumberFormat(format);
      return;
    }

    if (cell === "S16" || cell === "T16") {
      const s16 = mainSheet.getRange("S16").getValue();
      const t16 = mainSheet.getRange("T16").getValue();
      const monthly = s16 === "Monthly" && t16 === "Calendar";
      const yearly = s16 === "Yearly" && t16 === "Calendar";
      const format = monthly ? "mmm 'yy" : yearly ? "yyyy" : "dd/mm/yyyy";
      dataSheet.getRange(`M4:M${lastRow}`).setNumberFormat(format);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Handling edit event",
      sheetName: e?.range?.getSheet()?.getName(),
      cellNotation: e?.range?.getA1Notation(),
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
    handler: () => apiClient.runFullImport(),
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
