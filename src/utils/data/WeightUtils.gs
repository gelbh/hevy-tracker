/**
 * Weight Management Utilities
 * Provides weight import, logging, and validation functions
 * @module data/WeightUtils
 */

/**
 * Extracts weight value from a data point
 * @param {Object} point - Data point from Google Takeout
 * @returns {number|null} Weight in kg or null
 * @private
 */
const extractWeightFromPoint = (point) =>
  point.value?.[0]?.fpVal ?? point.fitValue?.[0]?.value?.fpVal ?? null;

/**
 * Imports weight entries from a Google Takeout JSON file
 * Parses Google Takeout JSON format and extracts weight data points
 * @param {string} content - JSON content from Google Takeout file
 * @returns {void}
 * @throws {Error} If JSON parsing fails or sheet operations fail
 * @example
 * // User uploads Google Takeout JSON file
 * const fileContent = "{\"Data Points\": [...]}";
 * importWeightFromTakeout(fileContent);
 */
function importWeightFromTakeout(content) {
  try {
    const data = JSON.parse(content);
    const records = Array.isArray(data["Data Points"])
      ? data["Data Points"]
      : (data.bucket || []).flatMap((b) =>
          (b.dataset || []).flatMap((d) => d.point || [])
        );

    const points = records
      .filter((pt) => pt.dataTypeName === "com.google.weight")
      .map((pt) => {
        const nanos = pt.startTimeNanos || pt.endTimeNanos;
        const ts = new Date(Number(nanos) / 1e6);
        const kg = extractWeightFromPoint(pt);
        if (kg == null) return null;
        const multiplier = Math.pow(10, WEIGHT_CONFIG.PRECISION_DECIMALS);
        return [ts, Math.round(kg * multiplier) / multiplier];
      })
      .filter(Boolean)
      .sort((a, b) => b[0] - a[0]);

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).clearContent();
    }
    if (points.length) {
      sheet.getRange(2, 1, points.length, 2).setValues(points);
    }
    manager.formatSheet();

    getActiveSpreadsheet().toast(
      `Imported ${points.length} entries`,
      "Import Complete",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, {
      operation: "Importing weight from Takeout data",
      sheetName: WEIGHT_SHEET_NAME,
    });
  }
}

/**
 * Logs a weight entry with user input
 * Prompts user for weight value and adds it to the Weight History sheet
 * @returns {void}
 * @throws {ValidationError} If weight value is invalid
 * @throws {SheetError} If sheet operations fail
 * @example
 * // User is prompted to enter weight
 * logWeight();
 */
function logWeight() {
  try {
    const ss = getActiveSpreadsheet();
    const unit = ss.getSheetByName("Main")?.getRange("I5").getValue() ?? "kg";
    const weight = promptForWeight(unit);

    if (weight === null) {
      return;
    }

    const manager = SheetManager.getOrCreate(WEIGHT_SHEET_NAME);
    const sheet = manager.sheet;
    const lastRow = Math.max(1, sheet.getLastRow());
    sheet.getRange(lastRow + 1, 1, 1, 2).setValues([[new Date(), weight]]);
    manager.formatSheet();

    ss.toast(
      `Weight of ${weight}${unit} logged successfully!`,
      "Success",
      TOAST_DURATION.NORMAL
    );
  } catch (error) {
    throw ErrorHandler.handle(error, "Logging weight");
  }
}

/**
 * Gets maximum weight value for a given unit
 * @param {string} unit - Weight unit (kg, lbs, stone)
 * @returns {number} Maximum weight value
 * @private
 */
const getMaxWeight = (unit) => {
  const maxWeights = {
    lbs: WEIGHT_CONFIG.MAX_WEIGHT_LBS,
    stone: WEIGHT_CONFIG.MAX_WEIGHT_STONE,
    kg: WEIGHT_CONFIG.MAX_WEIGHT_KG,
  };
  return maxWeights[unit] ?? WEIGHT_CONFIG.MAX_WEIGHT_KG;
};

/**
 * Validates weight input
 * @param {number} weight - Weight value to validate
 * @param {string} unit - Weight unit
 * @returns {boolean} True if weight is valid
 * @private
 */
const isValidWeight = (weight, unit) => {
  const maxWeight = getMaxWeight(unit);
  return !isNaN(weight) && weight > 0 && weight <= maxWeight;
};

/**
 * Prompts user for weight input
 * @param {string} [unit="kg"] - Weight unit
 * @returns {number|null} Weight value or null if canceled/invalid
 * @private
 */
function promptForWeight(unit = "kg") {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt(
    "Log Body Weight",
    `Enter weight in ${unit}:`,
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return null;

  const weight = parseFloat(result.getResponseText().replace(",", "."));
  const maxWeight = getMaxWeight(unit);

  if (!isValidWeight(weight, unit)) {
    ui.alert(
      `Invalid weight value. Please enter a number between 0 and ${maxWeight} ${unit}.`
    );
    return null;
  }

  return weight;
}
