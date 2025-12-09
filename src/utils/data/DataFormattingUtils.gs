/**
 * Data Formatting Utilities
 * Provides functions for formatting and normalizing data values
 * @module data/DataFormattingUtils
 */

/**
 * Formats a date string consistently accounting for timezone
 * @param {string} dateString - ISO date string to format
 * @returns {Date|string} Formatted date or empty string if invalid
 */
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    // Check if date is valid - invalid dates have NaN for getTime()
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date string: ${dateString}`);
    }
    return date;
  } catch (error) {
    throw ErrorHandler.handle(error, {
      context: "Formatting date",
      dateString,
    });
  }
}

/**
 * Normalizes weight values for consistency
 * @param {number|null|undefined} weight - Weight value to normalize
 * @returns {number|string} Normalized weight value rounded to configured precision or empty string
 */
const normalizeWeight = (weight) => {
  if (weight == null) return "";
  const multiplier = Math.pow(10, WEIGHT_CONFIG.PRECISION_DECIMALS);
  return Math.round(weight * multiplier) / multiplier;
};

/**
 * Normalizes numeric values for consistency
 * @param {number|null|undefined} value - Number to normalize
 * @returns {number|string} Normalized value or empty string if null/undefined
 */
const normalizeNumber = (value) => (value == null ? "" : value);

/**
 * Normalizes set types for consistency
 * @param {string|null|undefined} value - Set type to normalize
 * @returns {string} Normalized value or "normal" if null/undefined
 */
const normalizeSetType = (value) => value ?? "normal";

/**
 * Converts column number to letter reference
 * @param {number} column - Column number (1-based)
 * @returns {string} Column letter reference (e.g., 1 -> A, 27 -> AA)
 */
function columnToLetter(column) {
  let letter = "";
  let temp = column;

  while (temp > 0) {
    temp--;
    letter = String.fromCharCode(65 + (temp % 26)) + letter;
    temp = Math.floor(temp / 26);
  }

  return letter;
}

/**
 * Converts a snake_case string to Title Case.
 * @param {string} str
 * @returns {string}
 */
const toTitleCaseFromSnake = (str) => {
  if (!str) return "";
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Converts an array of snake_case strings into a comma-separated Title Case string.
 * @param {string[]} arr
 * @returns {string}
 */
const arrayToTitleCase = (arr) => {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((item) => toTitleCaseFromSnake(item))
    .filter(Boolean)
    .join(", ");
};

/**
 * Parses a value into number or null, throwing ValidationError if it's not numeric.
 * @param {*} value
 * @param {string} fieldName
 * @returns {number|null}
 */
function parseNumber(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (isNaN(n)) {
    throw new ValidationError(`Invalid ${fieldName} value: ${value}`);
  }
  return n;
}
