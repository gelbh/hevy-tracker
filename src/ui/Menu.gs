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
      .addItem("🔑 Configure Hevy Tracker", "showInitialSetup")
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
        .addItem("📥 Import All", "startFullImport")
        .addSeparator()
        .addItem("🏋️ Import Workouts", "importAllWorkouts")
        .addItem("💪 Import Exercises", "importAllExercises")
        .addItem("📋 Import Routines", "importAllRoutines")
        .addItem("📁 Import Routine Folders", "importAllRoutineFolders");

      menu
        .addSubMenu(importSubmenu)
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
 * Starts the full import process after user interaction
 */
function startFullImport() {
  try {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      "Start Full Import",
      "This will import all your Hevy data. Continue?",
      ui.ButtonSet.YES_NO
    );

    if (response === ui.Button.YES) {
      apiClient.runInitialImport();
    }
  } catch (error) {
    handleError(error, "Starting full import");
  }
}

/**
 * Shows the first-time welcome message if needed
 * This should be called from a user-triggered action to ensure proper auth
 */
function showWelcomeIfNeeded() {
  try {
    const properties = getUserProperties();
    if (properties && !properties.getProperty("WELCOMED")) {
      const ui = SpreadsheetApp.getUi();
      ui.alert(
        "Welcome to Hevy Tracker!",
        "Please set up your Hevy API key to get started.\n\n" +
          "Click Extensions → Hevy Tracker → Configure Hevy Tracker",
        ui.ButtonSet.OK
      );
      properties.setProperty("WELCOMED", "true");
    }
  } catch (error) {
    Logger.error("Error showing welcome message", { error });
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
