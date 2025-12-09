/**
 * Authentication and Authorization Utilities
 * Provides developer check and multi-login detection
 * @module auth/AuthUtils
 */

/**
 * Checks if the current user is a developer
 * @returns {boolean} True if user is a developer
 */
const isDeveloper = () =>
  DEVELOPER_CONFIG.EMAILS.includes(Session.getEffectiveUser().getEmail());

/**
 * Checks if the user might be experiencing multi-login issues and shows a warning
 * @returns {boolean} True if multi-login issue detected
 */
function checkForMultiLoginIssues() {
  try {
    const effectiveUser = Session.getEffectiveUser().getEmail();
    const activeUser = Session.getActiveUser().getEmail();

    if (!activeUser || activeUser !== effectiveUser) {
      showMultiLoginWarning();
      return true;
    }

    return false;
  } catch (error) {
    showMultiLoginWarning();
    return true;
  }
}
