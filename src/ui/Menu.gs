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

    const isTemplate = e?.source?.getId() === TEMPLATE_SPREADSHEET_ID;

    if (isDeveloper()) {
      addonMenu
        .addItem("🔧 Developer API Manager", "showDevApiManagerDialog")
        .addSeparator();
      if (isTemplate) {
        addonMenu
          .addItem("💪 Import Exercises", "importAllExercises")
          .addSeparator();
      }
    }

    if (isTemplate) {
      addonMenu.addItem("❓ View Setup Guide", "showGuideDialog");
    } else {
      addonMenu.addItem("🔑 Set Hevy API Key", "showInitialSetup");
    }

    if (!isTemplate) {
      const importSubmenu = ui
        .createMenu("📥 Import Data")
        .addItem("📥 Import All", "apiClient.runFullImport")
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

    const template = HtmlService.createTemplateFromFile(
      "src/ui/dialogs/Sidebar"
    );
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
    if (!e || !e.range) return;

    if (e.range.getSheet().getName() === "Main") {
      switch (e.range.getA1Notation()) {
        case "I5":
          const format = `#,##0 "${e.value}"`;

          const dataSheet =
            SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Data");
          const lastRow = dataSheet.getLastRow();

          const rangeList = dataSheet.getRangeList([
            `J4:J${lastRow}`,
            `E4:E${lastRow}`,
          ]);

          rangeList.setNumberFormat(format);
          break;
      }
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
      runFullImport: () => ({
        handler: apiClient.runFullImport.bind(apiClient),
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
      showTakeoutDialog: () => ({
        handler: showTakeoutDialog,
        successMessage: "Weight import initiated",
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
