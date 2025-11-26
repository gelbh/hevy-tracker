/**
 * Tests for ExerciseTranslator.gs - Exercise name translation utilities
 */

// Mock translation dictionary
const EXERCISE_TRANSLATIONS = new Map([
  ["press de banca (barra)", "Bench Press (Barbell)"],
  ["press de banca inclinado (barra)", "Incline Bench Press (Barbell)"],
  ["máquina para fondos sentado", "Seated Dip Machine"],
  ["remo sentado (máquina)", "Seated Row (Machine)"],
  ["vuelos posteriores (máquina)", "Rear Delt Fly (Machine)"],
  ["jalón al pecho (máquina)", "Lat Pulldown (Machine)"],
  ["curl martillo (cable)", "Hammer Curl (Cable)"],
  ["curl de bíceps inclinado (mancuerna)", "Incline Bicep Curl (Dumbbell)"],
  ["preacher curl (machine)", "Preacher Curl (Machine)"],
  ["aperturas (máquina)", "Chest Fly (Machine)"],
  ["press de hombros sentado (máquina)", "Seated Shoulder Press (Machine)"],
  ["extensión de tríceps (máquina)", "Tricep Extension (Machine)"],
  ["elevacion laterales (máquina)", "Lateral Raise (Machine)"],
  [
    "extensión de tríceps de un brazo (mancuerna)",
    "One Arm Tricep Extension (Dumbbell)",
  ],
  ["press de piernas sentado", "Seated Leg Press"],
  ["curl de pierna sentado", "Seated Leg Curl"],
  ["extensión de pierna", "Leg Extension"],
  ["extension de pantorrilla (máquina)", "Calf Extension (Machine)"],
  ["abducción de caderas", "Hip Abduction"],
  ["elevacion laterales (mancuerna)", "Lateral Raise (Dumbbell)"],
  [
    "pulldown lateral con agarre inverso (cable)",
    "Reverse Grip Lat Pulldown (Cable)",
  ],
  ["jalón al pecho (cable)", "Lat Pulldown (Cable)"],
  ["press de pecho inclinado (máquina)", "Incline Chest Press (Machine)"],
  ["cables cruzados", "Cable Crossover"],
]);

/**
 * Normalizes an exercise name for lookup (lowercase, trimmed)
 * @param {string} name - Exercise name to normalize
 * @returns {string} Normalized name
 */
function normalizeExerciseName(name) {
  return name?.toLowerCase().trim() || "";
}

/**
 * Gets the English translation of an exercise name.
 * Returns the original name if no translation is found.
 * @param {string} localizedName - The exercise name in the user's language
 * @returns {string} The English name if translation exists, otherwise the original name
 */
function getEnglishName(localizedName) {
  if (!localizedName || typeof localizedName !== "string") {
    return localizedName;
  }

  const normalized = normalizeExerciseName(localizedName);
  return EXERCISE_TRANSLATIONS.get(normalized) || localizedName;
}

/**
 * Checks if a translation exists for the given exercise name.
 * @param {string} localizedName - The exercise name to check
 * @returns {boolean} True if a translation exists
 */
function hasTranslation(localizedName) {
  if (!localizedName || typeof localizedName !== "string") {
    return false;
  }

  const normalized = normalizeExerciseName(localizedName);
  return EXERCISE_TRANSLATIONS.has(normalized);
}

describe("ExerciseTranslator", () => {
  describe("normalizeExerciseName()", () => {
    test("should convert to lowercase and trim", () => {
      expect(normalizeExerciseName("  BENCH PRESS  ")).toBe("bench press");
    });

    test("should handle already normalized names", () => {
      expect(normalizeExerciseName("bench press")).toBe("bench press");
    });

    test("should handle null values", () => {
      expect(normalizeExerciseName(null)).toBe("");
    });

    test("should handle undefined values", () => {
      expect(normalizeExerciseName(undefined)).toBe("");
    });

    test("should handle empty strings", () => {
      expect(normalizeExerciseName("")).toBe("");
    });

    test("should handle strings with only whitespace", () => {
      expect(normalizeExerciseName("   ")).toBe("");
    });

    test("should preserve special characters", () => {
      expect(normalizeExerciseName("Press (Barbell)")).toBe("press (barbell)");
    });

    test("should handle accented characters", () => {
      expect(normalizeExerciseName("Pressé de Banca")).toBe("pressé de banca");
    });
  });

  describe("getEnglishName()", () => {
    test("should translate Spanish exercise names", () => {
      expect(getEnglishName("Press de Banca (Barra)")).toBe(
        "Bench Press (Barbell)"
      );
    });

    test("should be case-insensitive", () => {
      expect(getEnglishName("PRESS DE BANCA (BARRA)")).toBe(
        "Bench Press (Barbell)"
      );
    });

    test("should handle whitespace variations", () => {
      expect(getEnglishName("  Press de Banca (Barra)  ")).toBe(
        "Bench Press (Barbell)"
      );
    });

    test("should return original name if translation not found", () => {
      expect(getEnglishName("Unknown Exercise")).toBe("Unknown Exercise");
    });

    test("should return original name for English exercises", () => {
      expect(getEnglishName("Bench Press (Barbell)")).toBe(
        "Bench Press (Barbell)"
      );
    });

    test("should handle null values", () => {
      expect(getEnglishName(null)).toBe(null);
    });

    test("should handle undefined values", () => {
      expect(getEnglishName(undefined)).toBe(undefined);
    });

    test("should handle empty strings", () => {
      expect(getEnglishName("")).toBe("");
    });

    test("should handle non-string values", () => {
      expect(getEnglishName(123)).toBe(123);
      expect(getEnglishName({})).toEqual({});
    });

    test("should translate multiple Spanish exercises", () => {
      expect(getEnglishName("Remo Sentado (Máquina)")).toBe(
        "Seated Row (Machine)"
      );
      expect(getEnglishName("Curl Martillo (Cable)")).toBe(
        "Hammer Curl (Cable)"
      );
      expect(getEnglishName("Press de Piernas Sentado")).toBe(
        "Seated Leg Press"
      );
    });

    test("should handle exercises with special characters", () => {
      expect(getEnglishName("Extensión de Tríceps (Máquina)")).toBe(
        "Tricep Extension (Machine)"
      );
    });

    test("should handle long exercise names", () => {
      expect(
        getEnglishName("Extensión de Tríceps de un Brazo (Mancuerna)")
      ).toBe("One Arm Tricep Extension (Dumbbell)");
    });
  });

  describe("hasTranslation()", () => {
    test("should return true for translatable exercises", () => {
      expect(hasTranslation("Press de Banca (Barra)")).toBe(true);
    });

    test("should be case-insensitive", () => {
      expect(hasTranslation("PRESS DE BANCA (BARRA)")).toBe(true);
    });

    test("should handle whitespace variations", () => {
      expect(hasTranslation("  Press de Banca (Barra)  ")).toBe(true);
    });

    test("should return false for non-translatable exercises", () => {
      expect(hasTranslation("Unknown Exercise")).toBe(false);
    });

    test("should return false for English exercises", () => {
      expect(hasTranslation("Bench Press (Barbell)")).toBe(false);
    });

    test("should return false for null values", () => {
      expect(hasTranslation(null)).toBe(false);
    });

    test("should return false for undefined values", () => {
      expect(hasTranslation(undefined)).toBe(false);
    });

    test("should return false for empty strings", () => {
      expect(hasTranslation("")).toBe(false);
    });

    test("should return false for non-string values", () => {
      expect(hasTranslation(123)).toBe(false);
      expect(hasTranslation({})).toBe(false);
    });

    test("should return true for multiple translatable exercises", () => {
      expect(hasTranslation("Remo Sentado (Máquina)")).toBe(true);
      expect(hasTranslation("Curl Martillo (Cable)")).toBe(true);
      expect(hasTranslation("Press de Piernas Sentado")).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("should handle very long exercise names", () => {
      const longName = "A".repeat(1000);
      expect(getEnglishName(longName)).toBe(longName);
      expect(hasTranslation(longName)).toBe(false);
    });

    test("should handle names with unicode characters", () => {
      const unicodeName = "Pressé de Banca (Barra)";
      expect(getEnglishName(unicodeName)).toBe(unicodeName);
      expect(hasTranslation(unicodeName)).toBe(false);
    });

    test("should handle names with numbers", () => {
      const nameWithNumbers = "Exercise 123 (Machine)";
      expect(getEnglishName(nameWithNumbers)).toBe(nameWithNumbers);
      expect(hasTranslation(nameWithNumbers)).toBe(false);
    });

    test("should handle names with special punctuation", () => {
      const nameWithPunctuation = "Exercise (Barbell) - Variation";
      expect(getEnglishName(nameWithPunctuation)).toBe(nameWithPunctuation);
      expect(hasTranslation(nameWithPunctuation)).toBe(false);
    });

    test("should preserve original formatting when no translation", () => {
      const original = "  Custom Exercise Name  ";
      expect(getEnglishName(original)).toBe(original);
    });
  });

  describe("Translation Dictionary Coverage", () => {
    test("should translate all Spanish exercises in dictionary", () => {
      EXERCISE_TRANSLATIONS.forEach((englishName, spanishName) => {
        expect(getEnglishName(spanishName)).toBe(englishName);
        expect(hasTranslation(spanishName)).toBe(true);
      });
    });

    test("should handle variations in dictionary keys", () => {
      // Test that normalization works for all dictionary entries
      EXERCISE_TRANSLATIONS.forEach((englishName, spanishName) => {
        // Test with different case variations
        const upperCase = spanishName.toUpperCase();
        const mixedCase = spanishName
          .split(" ")
          .map((word, i) =>
            i % 2 === 0 ? word.toUpperCase() : word.toLowerCase()
          )
          .join(" ");

        expect(getEnglishName(upperCase)).toBe(englishName);
        expect(getEnglishName(mixedCase)).toBe(englishName);
        expect(hasTranslation(upperCase)).toBe(true);
        expect(hasTranslation(mixedCase)).toBe(true);
      });
    });
  });
});
