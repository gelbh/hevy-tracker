/**
 * API Key Management Utilities
 * Provides developer API key management functions
 * @module auth/ApiKeyUtils
 */

const DEV_API_KEY_PREFIX = "DEV_API_KEY_";

/**
 * Gets the property key for a developer API key
 * @param {string} label - The label for the API key
 * @returns {string} Property key
 * @private
 */
const getDevApiKeyPropertyKey = (label) => `${DEV_API_KEY_PREFIX}${label}`;

/**
 * Global function to save Hevy API key, callable from dialog
 * This wrapper ensures errors are properly serialized for HTML service
 * Save is synchronous for reliability - validation happens in background
 * @param {string} apiKey - The API key to save
 */
function saveUserApiKey(apiKey) {
  try {
    // Save is now synchronous - completes immediately
    // Validation happens in background in ApiClient
    getApiClient().saveUserApiKey(apiKey);
  } catch (error) {
    // Serialize error for HTML service compatibility
    throw serializeErrorForHtml(error);
  }
}

/**
 * Saves a developer API key to user properties (per-user storage)
 * @param {string} label - The label for the API key
 * @param {string} key - The API key to save
 * @throws {ConfigurationError} If user is not authorized (not a developer)
 * @throws {ValidationError} If API key format is invalid
 */
function saveDevApiKey(label, key) {
  // Authorization check - only developers can save API keys
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  // Perform one-time migration from script properties to user properties
  migrateDevApiKeysToUserProperties();

  // Validate label
  if (!label || typeof label !== "string" || label.trim().length === 0) {
    throw new ValidationError("Label must be a non-empty string");
  }

  // Validate API key format
  if (!key || typeof key !== "string") {
    throw new ValidationError("API key must be a non-empty string");
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("API key cannot be empty");
  }

  // UUID v4 format validation: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // 8-4-4-4-12 hexadecimal characters
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(trimmed)) {
    throw new ValidationError(
      "Invalid API key format. API key must be a valid UUID (e.g., xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)."
    );
  }

  // Length validation (UUID should be exactly 36 characters including hyphens)
  if (trimmed.length !== 36) {
    throw new ValidationError("API key must be exactly 36 characters long.");
  }

  // Store in user properties (per-user, not shared across users)
  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  userProperties.setProperty(getDevApiKeyPropertyKey(label.trim()), trimmed);
}

/**
 * Switches to a different API key based on the label
 * Keys are stored in user properties (per-user storage)
 * @param {string} label - The label of the API key to switch to
 * @throws {ConfigurationError} If user is not authorized (not a developer)
 */
function useApiKey(label) {
  // Authorization check - only developers can switch API keys
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  // Get key from user properties (per-user, not shared across users)
  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  const storedKey = userProperties.getProperty(getDevApiKeyPropertyKey(label));

  if (!storedKey) {
    SpreadsheetApp.getUi().alert(`No key found for label: ${label}`);
    return;
  }

  const documentProperties = PropertiesService.getDocumentProperties();
  documentProperties.setProperty("HEVY_API_KEY", storedKey);
  documentProperties.deleteProperty("LAST_WORKOUT_UPDATE");

  getActiveSpreadsheet().toast(
    `Switched to API key: ${label}`,
    "Developer Mode",
    TOAST_DURATION.NORMAL
  );

  getApiClient().runFullImport();
}

/**
 * Removes an API key from user properties (per-user storage)
 * @param {string} label - The label of the API key to remove
 * @throws {ConfigurationError} If user is not authorized (not a developer)
 */
function removeApiKey(label) {
  // Authorization check - only developers can remove API keys
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  // Remove from user properties (per-user, not shared across users)
  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  userProperties.deleteProperty(getDevApiKeyPropertyKey(label));
  getActiveSpreadsheet().toast(
    `API Key "${label}" removed.`,
    "Developer Action",
    TOAST_DURATION.NORMAL
  );
}

/**
 * Retrieves all stored API keys and the current one for UI display
 * Keys are stored in user properties (per-user storage)
 * @returns {Object} Object containing all stored API keys and the current one
 * @throws {ConfigurationError} If user is not authorized (not a developer)
 */
function getApiKeyDataForUI() {
  // Authorization check - only developers can view API keys
  if (!isDeveloper()) {
    throw new ConfigurationError(
      "Access denied. Developer API key management is restricted to authorized developers."
    );
  }

  // Get keys from user properties (per-user, not shared across users)
  const userProperties = getUserProperties();
  if (!userProperties) {
    throw new ConfigurationError(
      "Unable to access user properties. Please try again."
    );
  }

  // Perform one-time migration from script properties to user properties
  migrateDevApiKeysToUserProperties();

  const props = userProperties.getProperties();
  const keys = Object.entries(props)
    .filter(([key]) => key.startsWith(DEV_API_KEY_PREFIX))
    .map(([key, value]) => ({
      label: key.replace(DEV_API_KEY_PREFIX, ""),
      key: value,
    }));
  const current =
    PropertiesService.getDocumentProperties().getProperty("HEVY_API_KEY");
  return { keys, current };
}

/**
 * Migrates developer API keys from script properties to user properties
 * This is a one-time migration to move from shared storage to per-user storage
 * @private
 */
function migrateDevApiKeysToUserProperties() {
  // Check if migration has already been completed
  const userProperties = getUserProperties();
  if (!userProperties) {
    return; // Can't migrate if user properties are unavailable
  }

  const migrationFlag = userProperties.getProperty("DEV_API_KEYS_MIGRATED");
  if (migrationFlag === "true") {
    return; // Migration already completed
  }

  try {
    // Get all keys from script properties
    const scriptProperties = PropertiesService.getScriptProperties();
    const scriptProps = scriptProperties.getProperties();
    const devKeys = Object.entries(scriptProps).filter(([key]) =>
      key.startsWith(DEV_API_KEY_PREFIX)
    );

    // If no keys to migrate, just set the flag and return
    if (devKeys.length === 0) {
      userProperties.setProperty("DEV_API_KEYS_MIGRATED", "true");
      return;
    }

    // Copy each key to user properties
    let migratedCount = 0;
    for (const [key, value] of devKeys) {
      // Only migrate if key doesn't already exist in user properties
      // (to avoid overwriting user's existing keys)
      if (!userProperties.getProperty(key)) {
        userProperties.setProperty(key, value);
        migratedCount++;
      }
    }

    // Delete migrated keys from script properties
    // Only delete after successful migration to user properties
    for (const [key] of devKeys) {
      scriptProperties.deleteProperty(key);
    }

    // Set migration flag to prevent re-running
    userProperties.setProperty("DEV_API_KEYS_MIGRATED", "true");

    if (migratedCount > 0) {
      console.log(
        `Migrated ${migratedCount} developer API key(s) from script properties to user properties`
      );
    }
  } catch (error) {
    // Log error but don't throw - migration failure shouldn't break the app
    console.error("Error during developer API key migration:", error);
    // Don't set migration flag on error, so it can be retried
  }
}
