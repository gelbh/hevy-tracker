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
 * Tracks and manages import state across execution sessions
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
        completedSteps: completedSteps ?? [],
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
    return progress?.completedSteps?.includes(stepName) ?? false;
  }

  /**
   * Gets list of steps that haven't been completed yet
   * @returns {Array<string>} Array of remaining step names
   */
  static getRemainingSteps() {
    const progress = this.loadProgress();
    const completedSteps = progress?.completedSteps ?? [];

    return IMPORT_STEPS.filter((step) => !completedSteps.includes(step));
  }

  /**
   * Gets list of completed steps
   * @returns {Array<string>} Array of completed step names
   */
  static getCompletedSteps() {
    const progress = this.loadProgress();
    return progress?.completedSteps ?? [];
  }

  /**
   * Checks if there is any existing progress
   * @returns {boolean} True if progress exists
   */
  static hasProgress() {
    const progress = this.loadProgress();
    return progress?.completedSteps?.length > 0 ?? false;
  }

  /**
   * Checks if an import is currently active (running)
   * An import is considered active if:
   * - Active import flag exists in properties
   * - Timestamp is less than ACTIVE_IMPORT_TIMEOUT_MS ago (not stale)
   * @returns {boolean} True if import is currently active
   */
  static isImportActive() {
    try {
      const props = getDocumentProperties();
      if (!props) {
        return false;
      }

      const activeJson = props.getProperty(ACTIVE_IMPORT_PROPERTY_KEY);
      if (!activeJson) {
        return false;
      }

      const activeState = JSON.parse(activeJson);
      const lastUpdate = new Date(activeState.timestamp).getTime();
      const now = Date.now();
      const elapsed = now - lastUpdate;

      // Consider import stale if older than timeout
      if (elapsed > ACTIVE_IMPORT_TIMEOUT_MS) {
        // Clear stale active import flag
        this.clearImportActive();
        return false;
      }

      return true;
    } catch (error) {
      console.warn("Failed to check if import is active:", error);
      return false;
    }
  }

  /**
   * Marks an import as currently active by setting timestamp in document properties
   */
  static markImportActive() {
    try {
      const props = getDocumentProperties();
      if (!props) {
        console.warn(
          "Unable to mark import as active: document properties unavailable"
        );
        return;
      }

      const activeState = {
        timestamp: new Date().toISOString(),
      };

      props.setProperty(
        ACTIVE_IMPORT_PROPERTY_KEY,
        JSON.stringify(activeState)
      );
    } catch (error) {
      console.warn("Failed to mark import as active:", error);
    }
  }

  /**
   * Updates the active import timestamp (heartbeat) to indicate import is still running
   * Should be called periodically during long-running imports
   */
  static updateImportActiveHeartbeat() {
    this.markImportActive();
  }

  /**
   * Clears the active import flag from document properties
   */
  static clearImportActive() {
    try {
      const props = getDocumentProperties();
      if (props) {
        props.deleteProperty(ACTIVE_IMPORT_PROPERTY_KEY);
      }
    } catch (error) {
      console.warn("Failed to clear active import flag:", error);
    }
  }

  /**
   * Gets deferred operations from document properties
   * @returns {Object|null} Deferred operations object or null
   * @private
   */
  static _getDeferredOperationsData() {
    try {
      const props = getDocumentProperties();
      if (!props) {
        return null;
      }

      const deferredJson = props.getProperty(DEFERRED_POST_PROCESSING_KEY);
      if (!deferredJson) {
        return null;
      }

      return JSON.parse(deferredJson);
    } catch (error) {
      console.warn("Failed to get deferred operations data:", error);
      return null;
    }
  }

  /**
   * Saves deferred operations to document properties
   * @param {Object} deferred - Deferred operations object
   * @private
   */
  static _saveDeferredOperations(deferred) {
    try {
      const props = getDocumentProperties();
      if (!props) {
        console.warn(
          "Unable to save deferred operations: document properties unavailable"
        );
        return;
      }

      if (Object.keys(deferred).length === 0) {
        props.deleteProperty(DEFERRED_POST_PROCESSING_KEY);
      } else {
        props.setProperty(
          DEFERRED_POST_PROCESSING_KEY,
          JSON.stringify(deferred)
        );
      }
    } catch (error) {
      console.warn("Failed to save deferred operations:", error);
    }
  }

  /**
   * Marks a post-processing operation as deferred (needs completion)
   * @param {string} operationName - Name of the deferred operation
   */
  static markDeferredOperation(operationName) {
    const deferred = this._getDeferredOperationsData() ?? {};
    deferred[operationName] = {
      timestamp: new Date().toISOString(),
      needsCompletion: true,
    };
    this._saveDeferredOperations(deferred);
  }

  /**
   * Marks a post-processing operation as completed
   * @param {string} operationName - Name of the completed operation
   */
  static markOperationComplete(operationName) {
    const deferred = this._getDeferredOperationsData();
    if (!deferred) {
      return;
    }

    delete deferred[operationName];
    this._saveDeferredOperations(deferred);
  }

  /**
   * Gets list of deferred post-processing operations that need completion
   * @returns {Array<string>} Array of operation names that need completion
   */
  static getDeferredOperations() {
    const deferred = this._getDeferredOperationsData();
    if (!deferred) {
      return [];
    }

    return Object.keys(deferred).filter(
      (op) => deferred[op].needsCompletion === true
    );
  }

  /**
   * Checks if a specific post-processing operation is deferred
   * @param {string} operationName - Name of the operation to check
   * @returns {boolean} True if operation is deferred
   */
  static isOperationDeferred(operationName) {
    const deferred = this.getDeferredOperations();
    return deferred.includes(operationName);
  }
}
