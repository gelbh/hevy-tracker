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
    const menu = ui.createAddonMenu();
    const authMode = e && e.authMode ? e.authMode : ScriptApp.AuthMode.NONE;

    // Add authorized items if appropriate
    if (authMode !== ScriptApp.AuthMode.NONE) {
      addAuthorizedMenuItems(menu, ui);
    }

    menu.addSeparator().addItem("❓ View Setup Guide", "showGuideDialog");

    menu.addToUi();
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Creating menu",
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

    showHtmlDialog("src/ui/dialogs/Sidebar", {
      width: 300,
      title: "Hevy Tracker",
      templateData: { isTemplate },
      showAsSidebar: true,
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Opening homepage",
      eventType: e?.type,
    });
  }
}

/**
 * Adds menu items that require authorization
 * @private
 */
function addAuthorizedMenuItems(menu, ui) {
  try {
    const currentId = SpreadsheetApp.getActive().getId();
    const isTemplate =
      currentId === "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

    if (isTemplate) {
      addTemplateMenuItems(menu);
    } else {
      addStandardMenuItems(menu, ui);
    }
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Adding authorized menu items",
    });
  }
}

/**
 * Adds menu items specific to the template spreadsheet
 * @private
 */
function addTemplateMenuItems(menu) {
  menu
    .addItem(
      "📋 Create New Spreadsheet From Template",
      "showCreateSpreadsheetDialog"
    )
    .addSeparator()
    .addItem("💪 Import Exercises", "importAllExercises");
}

/**
 * Adds standard menu items for non-template spreadsheets
 * @private
 */
function addStandardMenuItems(menu, ui) {
  const importSubmenu = createImportSubmenu(ui);
  const routineBuilderSubmenu = createRoutineBuilderSubmenu(ui);

  menu
    .addItem("🔑 Set Hevy API Key", "showInitialSetup")
    .addSeparator()
    .addSubMenu(importSubmenu)
    .addSeparator()
    .addSubMenu(routineBuilderSubmenu)
    .addSeparator()
    .addItem("⚖️ Log Weight", "logWeight")
    .addSeparator()
    .addItem("📋 Create New Spreadsheet", "showCreateSpreadsheetDialog");
}

/**
 * Creates the import submenu
 * @private
 */
function createImportSubmenu(ui) {
  return ui
    .createMenu("📥 Import Data")
    .addItem("📥 Import All", "apiClient.runInitialImport")
    .addSeparator()
    .addItem("🏋️ Import Workouts", "importAllWorkouts")
    .addItem("💪 Import Exercises", "importAllExercises")
    .addItem("📋 Import Routines", "importAllRoutines")
    .addItem("📁 Import Routine Folders", "importAllRoutineFolders");
}

/**
 * Creates the routine builder submenu
 * @private
 */
function createRoutineBuilderSubmenu(ui) {
  return ui
    .createMenu("📝 Routine Builder")
    .addItem("📋 Create Routine from Sheet", "createRoutineFromSheet")
    .addItem("🗑️ Clear Builder Form", "clearRoutineBuilder");
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
 * Shows the create spreadsheet dialog
 */
function showCreateSpreadsheetDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/TemplateDialog", {
      width: 450,
      height: 250,
      title: "Create Template Spreadsheet",
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing create spreadsheet dialog",
    });
  }
}

/**
 * Shows the setup guide dialog
 */
function showGuideDialog() {
  try {
    showHtmlDialog("src/ui/dialogs/SetupInstructions", {
      width: 500,
      height: 500,
      title: "Hevy Tracker Setup Guide",
      modalTitle: "Setup Guide",
    });
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Showing guide dialog",
    });
  }
}
