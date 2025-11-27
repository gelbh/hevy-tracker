/**
 * Utility class for tracking import progress across multiple execution sessions
 * Allows resuming imports that were interrupted by timeout
 * @module ImportProgressTracker
 */

/**
 * @typedef {Object} ImportProgressState
 * @property {Array<string>} completedSteps - Array of completed step names
 * @property {string} timestamp - ISO timestamp of when progress was saved
 * @property {boolean} isResuming - Whether this is a resumed import
 */

/**
 * Valid import step names in execution order
 * @type {Array<string>}
 * @private
 */
const IMPORT_STEPS = ["exercises", "routineFolders", "routines", "workouts"];

/**
 * Import progress tracking utility
 */
class ImportProgressTracker {
  /**
   * Saves import progress to document properties
   * @param {Array<string>} completedSteps - Array of completed step names
   */
  static saveProgress(completedSteps) {
    try {
      const props = getDocumentProperties();
      if (!props) {
        console.warn(
          "Unable to save import progress: document properties unavailable"
        );
        return;
      }

      const progressState = {
        completedSteps: completedSteps || [],
        timestamp: new Date().toISOString(),
        isResuming: true,
      };

      props.setProperty(
        IMPORT_PROGRESS_PROPERTY_KEY,
        JSON.stringify(progressState)
      );
    } catch (error) {
      console.warn("Failed to save import progress:", error);
    }
  }

  /**
   * Loads import progress from document properties
   * @returns {ImportProgressState|null} Progress state or null if not found
   */
  static loadProgress() {
    try {
      const props = getDocumentProperties();
      if (!props) {
        return null;
      }

      const progressJson = props.getProperty(IMPORT_PROGRESS_PROPERTY_KEY);
      if (!progressJson) {
        return null;
      }

      return JSON.parse(progressJson);
    } catch (error) {
      console.warn("Failed to load import progress:", error);
      return null;
    }
  }

  /**
   * Clears all import progress from document properties
   */
  static clearProgress() {
    try {
      const props = getDocumentProperties();
      if (props) {
        props.deleteProperty(IMPORT_PROGRESS_PROPERTY_KEY);
      }
    } catch (error) {
      console.warn("Failed to clear import progress:", error);
    }
  }

  /**
   * Checks if a specific import step has been completed
   * @param {string} stepName - Name of the step to check
   * @returns {boolean} True if step is complete
   */
  static isStepComplete(stepName) {
    const progress = this.loadProgress();
    if (!progress || !progress.completedSteps) {
      return false;
    }

    return progress.completedSteps.includes(stepName);
  }

  /**
   * Gets list of steps that haven't been completed yet
   * @returns {Array<string>} Array of remaining step names
   */
  static getRemainingSteps() {
    const progress = this.loadProgress();
    const completedSteps = progress?.completedSteps || [];

    return IMPORT_STEPS.filter((step) => !completedSteps.includes(step));
  }

  /**
   * Gets list of completed steps
   * @returns {Array<string>} Array of completed step names
   */
  static getCompletedSteps() {
    const progress = this.loadProgress();
    return progress?.completedSteps || [];
  }

  /**
   * Checks if there is any existing progress
   * @returns {boolean} True if progress exists
   */
  static hasProgress() {
    const progress = this.loadProgress();
    return progress !== null && progress.completedSteps?.length > 0;
  }
}
