/**
 * Core menu functionality for the Hevy Tracker add-on
 */

/**
 * Triggers when the add-on is installed
 * @param {Object} e The event object
 */
function onInstall(e) {
  onOpen(e);
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

    menu
      .addItem("🔑 Set Hevy API Key", "showInitialSetup")
      .addSeparator()
      .addItem("❓ View Setup Guide", "showGuideDialog")
      .addSeparator();

    if (authMode !== ScriptApp.AuthMode.NONE) {
      addAuthorizedMenuItems(menu, ui);
    }

    menu.addToUi();
  } catch (error) {
    Logger.error("Error creating menu", { error, authMode: e?.authMode });
  }
}

/**
 * Function that runs when the add-on opens in the sidebar
 * @param {Object} e The event object
 */
function onHomepage(e) {
  const isTemplate =
    SpreadsheetApp.getActive().getId() ===
    "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

  showHtmlDialog("src/ui/dialogs/Sidebar", {
    width: 300,
    title: "Hevy Tracker",
    templateData: { isTemplate },
    showAsSidebar: true,
  });
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
    handleError(error, "Showing initial setup");
  }
}

/**
 * Adds menu items that require authorization
 * @param {GoogleAppsScript.Base.Menu} menu - The menu to add items to
 * @param {GoogleAppsScript.Base.Ui} ui - The UI instance
 * @private
 */
function addAuthorizedMenuItems(menu, ui) {
  try {
    const currentId = SpreadsheetApp.getActive().getId();
    const isTemplate =
      currentId === "1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk";

    if (isTemplate) {
      menu
        .addItem(
          "📋 Create New Spreadsheet From Template",
          "showCreateSpreadsheetDialog"
        )
        .addSeparator()
        .addItem("💪 Import Exercises", "importAllExercises");
    } else {
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

      menu
        .addSubMenu(importSubmenu)
        .addSeparator()
        .addSubMenu(routineBuilderSubmenu)
        .addSeparator()
        .addItem("⚖️ Log Weight", "logWeight")
        .addSeparator()
        .addItem("📋 Create New Spreadsheet", "showCreateSpreadsheetDialog");
    }
  } catch (error) {
    Logger.error("Error adding authorized menu items", { error });
  }
}

/**
 * Shows the create spreadsheet dialog
 */
function showCreateSpreadsheetDialog() {
  showHtmlDialog("src/ui/dialogs/TemplateDialog", {
    width: 450,
    height: 250,
    title: "Create Template Spreadsheet",
  });
}

/**
 * Shows the setup guide dialog
 */
function showGuideDialog() {
  showHtmlDialog("src/ui/dialogs/SetupInstructions", {
    width: 500,
    height: 500,
    title: "Hevy Tracker Setup Guide",
    modalTitle: "Setup Guide",
  });
}
