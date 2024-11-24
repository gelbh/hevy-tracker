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
 * or the add-on is installed.
 * @param {Object} e The event object
 */
function onOpen(e) {
  const ui = SpreadsheetApp.getUi();
  let menu = ui.createAddonMenu();
  
  const currentId = SpreadsheetApp.getActive().getId();
  const isTemplate = currentId === '1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk';
  
  if (isTemplate) {
    menu.addItem('📋 Create New Spreadsheet From Template', 'showCreateSpreadsheetDialog')
      .addSeparator()
      .addItem('💪 Import Exercises', 'importAllExercises')
      .addSeparator()
      .addItem('❓ View Setup Guide', 'showGuideDialog')
      .addToUi();
  } else {
    menu.addItem('🔑 Set Hevy API Key', 'apiClient.manageHevyApiKey')
      .addSeparator()
      .addSubMenu(ui.createMenu('📥 Import Data')
        .addItem('📥 Import All', 'apiClient.runInitialImport')
        .addSeparator()
        .addItem('🏋️ Import Workouts', 'importAllWorkouts')
        .addItem('💪 Import Exercises', 'importAllExercises')
        .addItem('📋 Import Routines', 'importAllRoutines')
        .addItem('📁 Import Routine Folders', 'importAllRoutineFolders'))
      .addSeparator()
      .addItem('⚖️ Log Weight', 'logWeight')
      .addSeparator()
      .addItem('📋 Create New Spreadsheet From Template', 'showCreateSpreadsheetDialog')
      .addSeparator()
      .addItem('❓ View Setup Guide', 'showGuideDialog')
      .addToUi();

    const properties = getUserProperties();
    if (properties && !properties.getProperty('WELCOMED')) {
      properties.deleteAllProperties();
      ui.alert(
        'Welcome to Hevy Tracker!',
        'Please set up your Hevy API key to get started.\n\n' +
        'Click Extensions → Hevy Tracker → Set Hevy API Key',
        ui.ButtonSet.OK
      );
      properties.setProperty('WELCOMED', 'true');
    }
  }
}

/**
 * Function that runs when the add-on opens in the sidebar
 * @param {Object} e The event object
 * @return {CardService.Card} The card to show to the user
 */
function onHomepage(e) {
  const isTemplate = SpreadsheetApp.getActive().getId() === '1i0g1h1oBrwrw-L4-BW0YUHeZ50UATcehNrg2azkcyXk';

  showHtmlDialog('src/ui/dialogs/Sidebar', {
    width: 300,
    title: 'Hevy Tracker',
    templateData: { isTemplate },
    showAsSidebar: true
  });
}

/**
 * Shows the create spreadsheet dialog
 */
function showCreateSpreadsheetDialog() {
  showHtmlDialog('src/ui/dialogs/TemplateDialog', {
    width: 450,
    height: 250,
    title: 'Create Template Spreadsheet'
  });
}

/**
 * Shows the setup guide dialog
 */
function showGuideDialog() {
  showHtmlDialog('src/ui/dialogs/SetupInstructions', {
    width: 500,
    height: 500,
    title: 'Hevy Tracker Setup Guide',
    modalTitle: 'Setup Guide'
  });
}