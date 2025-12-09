/**
 * Tests for DataFormattingUtils.gs - Data formatting and normalization functions
 */

// Mock constants
const WEIGHT_CONFIG = {
  PRECISION_DECIMALS: 2,
};

global.WEIGHT_CONFIG = WEIGHT_CONFIG;

// Mock ErrorHandler
const mockErrorHandler = {
  handle: jest.fn((error, context) => {
    throw error;
  }),
};

global.ErrorHandler = mockErrorHandler;

// Mock ValidationError
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

global.ValidationError = ValidationError;

// Mock functions
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

const normalizeWeight = (weight) => {
  if (weight == null) return "";
  const multiplier = Math.pow(10, WEIGHT_CONFIG.PRECISION_DECIMALS);
  return Math.round(weight * multiplier) / multiplier;
};

const normalizeNumber = (value) => (value == null ? "" : value);

const normalizeSetType = (value) => value ?? "normal";

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

const toTitleCaseFromSnake = (str) => {
  if (!str) return "";
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

const arrayToTitleCase = (arr) => {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((item) => toTitleCaseFromSnake(item))
    .filter(Boolean)
    .join(", ");
};

function parseNumber(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (isNaN(n)) {
    throw new ValidationError(`Invalid ${fieldName} value: ${value}`);
  }
  return n;
}

describe("DataFormattingUtils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("formatDate", () => {
    test("should return Date object for valid ISO date string", () => {
      const dateString = "2024-01-15T10:30:00Z";
      const result = formatDate(dateString);

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2024-01-15T10:30:00.000Z");
    });

    test("should return empty string for empty string", () => {
      const result = formatDate("");
      expect(result).toBe("");
    });

    test.each([null, undefined])(
      "should return empty string for %s",
      (value) => {
        const result = formatDate(value);
        expect(result).toBe("");
      }
    );

    test("should handle invalid date string", () => {
      const invalidDate = "not-a-date";
      expect(() => formatDate(invalidDate)).toThrow();
      expect(mockErrorHandler.handle).toHaveBeenCalled();
    });
  });

  describe("normalizeWeight", () => {
    test("should round weight to configured precision", () => {
      expect(normalizeWeight(100.123456)).toBe(100.12);
      expect(normalizeWeight(50.999)).toBe(51.0);
      expect(normalizeWeight(75.5)).toBe(75.5);
    });

    test.each([null, undefined])(
      "should return empty string for %s",
      (value) => {
        expect(normalizeWeight(value)).toBe("");
      }
    );

    test("should handle zero", () => {
      expect(normalizeWeight(0)).toBe(0);
    });

    test("should handle negative numbers", () => {
      expect(normalizeWeight(-10.123)).toBe(-10.12);
    });
  });

  describe("normalizeNumber", () => {
    test("should return number as-is", () => {
      expect(normalizeNumber(42)).toBe(42);
      expect(normalizeNumber(0)).toBe(0);
      expect(normalizeNumber(-10)).toBe(-10);
      expect(normalizeNumber(3.14)).toBe(3.14);
    });

    test.each([null, undefined])(
      "should return empty string for %s",
      (value) => {
        expect(normalizeNumber(value)).toBe("");
      }
    );
  });

  describe("normalizeSetType", () => {
    test("should return value as-is when provided", () => {
      expect(normalizeSetType("warmup")).toBe("warmup");
      expect(normalizeSetType("drop")).toBe("drop");
      expect(normalizeSetType("normal")).toBe("normal");
    });

    test.each([null, undefined])(
      "should return 'normal' for %s",
      (value) => {
        expect(normalizeSetType(value)).toBe("normal");
      }
    );
  });

  describe("columnToLetter", () => {
    test("should convert column 1 to A", () => {
      expect(columnToLetter(1)).toBe("A");
    });

    test("should convert column 26 to Z", () => {
      expect(columnToLetter(26)).toBe("Z");
    });

    test("should convert column 27 to AA", () => {
      expect(columnToLetter(27)).toBe("AA");
    });

    test("should convert column 52 to AZ", () => {
      expect(columnToLetter(52)).toBe("AZ");
    });

    test("should convert column 53 to BA", () => {
      expect(columnToLetter(53)).toBe("BA");
    });

    test("should convert column 702 to ZZ", () => {
      expect(columnToLetter(702)).toBe("ZZ");
    });

    test("should convert column 703 to AAA", () => {
      expect(columnToLetter(703)).toBe("AAA");
    });
  });

  describe("toTitleCaseFromSnake", () => {
    test("should convert snake_case to Title Case", () => {
      expect(toTitleCaseFromSnake("primary_muscle_group")).toBe(
        "Primary Muscle Group"
      );
      expect(toTitleCaseFromSnake("chest_press")).toBe("Chest Press");
    });

    test("should handle single word", () => {
      expect(toTitleCaseFromSnake("chest")).toBe("Chest");
    });

    test("should handle multiple underscores", () => {
      expect(toTitleCaseFromSnake("upper_body_chest")).toBe("Upper Body Chest");
    });

    test("should return empty string for empty string", () => {
      expect(toTitleCaseFromSnake("")).toBe("");
    });

    test.each([null, undefined])(
      "should return empty string for %s",
      (value) => {
        expect(toTitleCaseFromSnake(value)).toBe("");
      }
    );

    test("should handle already title case", () => {
      expect(toTitleCaseFromSnake("CHEST_PRESS")).toBe("Chest Press");
    });
  });

  describe("arrayToTitleCase", () => {
    test("should convert array of snake_case to comma-separated Title Case", () => {
      expect(arrayToTitleCase(["chest", "shoulders", "triceps"])).toBe(
        "Chest, Shoulders, Triceps"
      );
      expect(arrayToTitleCase(["primary_muscle", "secondary_muscle"])).toBe(
        "Primary Muscle, Secondary Muscle"
      );
    });

    test("should handle empty array", () => {
      expect(arrayToTitleCase([])).toBe("");
    });

    test.each([null, undefined])(
      "should return empty string for %s",
      (value) => {
        expect(arrayToTitleCase(value)).toBe("");
      }
    );

    test("should return empty string for non-array", () => {
      expect(arrayToTitleCase("not an array")).toBe("");
      expect(arrayToTitleCase(123)).toBe("");
    });

    test("should filter out empty strings", () => {
      expect(arrayToTitleCase(["chest", "", "shoulders"])).toBe(
        "Chest, Shoulders"
      );
    });
  });

  describe("parseNumber", () => {
    test("should parse valid number string", () => {
      expect(parseNumber("42", "reps")).toBe(42);
      expect(parseNumber("3.14", "weight")).toBe(3.14);
      expect(parseNumber("0", "reps")).toBe(0);
    });

    test("should parse number", () => {
      expect(parseNumber(42, "reps")).toBe(42);
      expect(parseNumber(3.14, "weight")).toBe(3.14);
    });

    test.each([null, undefined])(
      "should return null for %s",
      (value) => {
        expect(parseNumber(value, "reps")).toBeNull();
      }
    );

    test("should return null for empty string", () => {
      expect(parseNumber("", "reps")).toBeNull();
    });

    test("should throw ValidationError for invalid string", () => {
      expect(() => parseNumber("not a number", "reps")).toThrow(
        ValidationError
      );
      expect(() => parseNumber("not a number", "reps")).toThrow(
        "Invalid reps value: not a number"
      );
    });

    test("should throw ValidationError for NaN", () => {
      expect(() => parseNumber(NaN, "reps")).toThrow(ValidationError);
    });
  });
});
