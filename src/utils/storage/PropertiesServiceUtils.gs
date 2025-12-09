/**
 * Properties Service Utilities
 * Provides safe access to Google Apps Script Properties Service
 * @module storage/PropertiesServiceUtils
 */

/**
 * Gets properties service safely with error handling
 * @param {Function} serviceGetter - Function to get the properties service
 * @param {string} serviceName - Name of the service for error logging
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 * @private
 */
const getPropertiesSafely = (serviceGetter, serviceName) => {
  try {
    return serviceGetter();
  } catch (error) {
    console.error(`Failed to get ${serviceName}:`, error);
    return null;
  }
};

/**
 * Gets user properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 */
const getUserProperties = () =>
  getPropertiesSafely(
    () => PropertiesService.getUserProperties(),
    "user properties"
  );

/**
 * Gets document properties safely
 * @returns {GoogleAppsScript.Properties.Properties|null} Properties object or null if error
 */
const getDocumentProperties = () =>
  getPropertiesSafely(
    () => PropertiesService.getDocumentProperties(),
    "document properties"
  );
