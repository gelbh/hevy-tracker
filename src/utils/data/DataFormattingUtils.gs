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

/**
 * Formats a rep_range object as a string (e.g., "8-12" or "10" if start === end)
 * @param {Object|null|undefined} repRange - Rep range object with start and end
 * @returns {string} Formatted rep range string or empty string if invalid
 */
function formatRepRange(repRange) {
  if (!repRange || typeof repRange !== "object") return "";
  const start = repRange.start;
  const end = repRange.end;
  if (start == null || end == null) return "";
  if (start === end) return String(start);
  return `${start}-${end}`;
}

/**
 * Extracts the appropriate reps value from a set for display purposes.
 * Prioritizes rep_range over reps if both exist.
 * @param {Object} set - Set object with reps and/or rep_range
 * @returns {string|number|null} Formatted reps value (rep_range as "8-12" or single reps number)
 */
function getRepsValue(set) {
  if (!set) return null;

  // Prioritize rep_range if it exists
  if (set.rep_range && typeof set.rep_range === "object") {
    const formatted = formatRepRange(set.rep_range);
    if (formatted) return formatted;
  }

  // Fall back to reps if rep_range is not available
  if (set.reps != null) {
    return set.reps;
  }

  return null;
}

/**
 * Parses a reps value (string or number) into reps or rep_range structure.
 * Supports "8-12" format for rep ranges. If start equals end, returns as single reps value.
 * @param {string|number|null|undefined} repsValue - Reps value to parse
 * @returns {{reps: number|null, rep_range: {start: number, end: number}|null}} Parsed reps structure
 * @throws {ValidationError} If format is invalid
 */
function parseRepRange(repsValue) {
  if (repsValue == null || repsValue === "") {
    return { reps: null, rep_range: null };
  }

  // Convert to string for parsing
  const strValue = String(repsValue).trim();

  // Check if it contains a hyphen (rep range format)
  if (strValue.includes("-")) {
    const parts = strValue.split("-");
    if (parts.length !== 2) {
      throw new ValidationError(
        `Invalid rep range format: "${repsValue}". Expected format: "8-12"`
      );
    }

    const start = parseNumber(parts[0].trim(), "rep range start");
    const end = parseNumber(parts[1].trim(), "rep range end");

    if (start === null || end === null) {
      throw new ValidationError(
        `Invalid rep range values: "${repsValue}". Both start and end must be numbers.`
      );
    }

    if (start > end) {
      throw new ValidationError(
        `Invalid rep range: start (${start}) cannot be greater than end (${end})`
      );
    }

    // If start equals end, return as single reps value
    if (start === end) {
      return { reps: start, rep_range: null };
    }

    return { reps: null, rep_range: { start: start, end: end } };
  }

  // Single number format
  const reps = parseNumber(repsValue, "reps");
  return { reps: reps, rep_range: null };
}

/**
 * Gets the appropriate reps/rep_range structure for API submission.
 * Prioritizes rep_range if both exist, otherwise uses reps.
 * @param {Object} set - Set object with reps and/or rep_range
 * @returns {Object} Object with reps and/or rep_range for API payload
 */
function getRepsForApi(set) {
  if (!set) {
    return { reps: null, rep_range: null };
  }

  const result = {};

  // Prioritize rep_range if it exists
  if (set.rep_range && typeof set.rep_range === "object") {
    const start = set.rep_range.start;
    const end = set.rep_range.end;
    if (start != null && end != null) {
      result.rep_range = { start: start, end: end };
      // Don't include reps when rep_range is present
      return result;
    }
  }

  // Fall back to reps if rep_range is not available
  if (set.reps != null) {
    result.reps = set.reps;
  }

  return result;
}
