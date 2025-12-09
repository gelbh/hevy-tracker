/**
 * Trigger Management Utilities
 * Provides functions for managing automatic import triggers
 * @module triggers/TriggerUtils
 */

/**
 * Runs the automatic import process
 * This is the function called by the triggers
 * @returns {Promise<void>}
 */
async function runAutomaticImport() {
  const startTime = Date.now();
  const ss = getActiveSpreadsheet();
  const properties = getDocumentProperties();
  const apiKey = properties?.getProperty("HEVY_API_KEY");
  const isTemplate = ss.getId() === TEMPLATE_SPREADSHEET_ID;

  if (!apiKey) {
    if (!isTemplate) {
      showInitialSetup();
    }
    return;
  }

  try {
    await importAllExercises();

    if (!isTemplate) {
      if ((await importAllWorkouts()) > 0) {
        await importAllRoutineFolders();
        await importAllRoutines();
      }
    }

    const executionTime = Date.now() - startTime;
    QuotaTracker.recordExecutionTime(executionTime);

    const quotaWarning = QuotaTracker.checkQuotaWarnings();
    if (quotaWarning) {
      console.warn("Quota warning:", quotaWarning);
    }

    ss.toast(
      "Importing all data completed successfully",
      "Automatic Import",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    QuotaTracker.recordExecutionTime(Date.now() - startTime);
    ErrorHandler.handle(error, { operation: "Running import on open" }, false);
  }
}

/**
 * Runs the initial import after API key is set
 * This function is called by a time-based trigger to avoid blocking the dialog
 * Deletes its own trigger after execution to prevent accumulation
 * @returns {Promise<void>}
 */
async function runInitialImport() {
  try {
    // Delete trigger after execution to prevent accumulation
    const triggers = ScriptApp.getProjectTriggers();
    const thisTrigger = triggers.find(
      (t) =>
        t.getHandlerFunction() === "runInitialImport" &&
        t.getEventType() === ScriptApp.EventType.CLOCK
    );
    if (thisTrigger) {
      ScriptApp.deleteTrigger(thisTrigger);
    }

    // Early exit if import already active
    if (ImportProgressTracker.isImportActive()) {
      console.log("Import already active, skipping initial import trigger");
      return;
    }

    // Get API key from properties
    const properties = getDocumentProperties();
    const apiKey = properties?.getProperty("HEVY_API_KEY");

    if (!apiKey) {
      console.warn("No API key found for initial import");
      return;
    }

    // Run full import with skipResumeDialog flag
    await apiClient.runFullImport(apiKey, true);
  } catch (error) {
    console.error("Initial import failed:", error);
    ErrorHandler.handle(error, { operation: "Running initial import" }, false);
  }
}
