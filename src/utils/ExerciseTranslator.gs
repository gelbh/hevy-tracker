/**
 * Utility for translating exercise names from various languages to English.
 * Used as a fallback when exercise_template_id is not available for matching.
 */

/**
 * Translation dictionary mapping localized exercise names to English names.
 * Keys are lowercase for case-insensitive matching.
 */
const EXERCISE_TRANSLATIONS = {
  // Spanish translations
  "press de banca (barra)": "Bench Press (Barbell)",
  "press de banca inclinado (barra)": "Incline Bench Press (Barbell)",
  "máquina para fondos sentado": "Seated Dip Machine",
  "remo sentado (máquina)": "Seated Row (Machine)",
  "vuelos posteriores (máquina)": "Rear Delt Fly (Machine)",
  "jalón al pecho (máquina)": "Lat Pulldown (Machine)",
  "remo alto iso-lateral": "High Row Iso-Lateral",
  "curl martillo (cable)": "Hammer Curl (Cable)",
  "curl de bíceps inclinado (mancuerna)": "Incline Bicep Curl (Dumbbell)",
  "preacher curl (machine)": "Preacher Curl (Machine)",
  "aperturas (máquina)": "Chest Fly (Machine)",
  "press de hombros sentado (máquina)": "Seated Shoulder Press (Machine)",
  "extensión de tríceps (máquina)": "Tricep Extension (Machine)",
  "elevacion laterales (máquina)": "Lateral Raise (Machine)",
  "extensión de tríceps de un brazo (mancuerna)":
    "One Arm Tricep Extension (Dumbbell)",
  "press de piernas sentado": "Seated Leg Press",
  "curl de pierna sentado": "Seated Leg Curl",
  "extensión de pierna": "Leg Extension",
  "extension de pantorrilla (máquina)": "Calf Extension (Machine)",
  "abducción de caderas": "Hip Abduction",
  "elevacion laterales (mancuerna)": "Lateral Raise (Dumbbell)",
  "pulldown lateral con agarre inverso (cable)":
    "Reverse Grip Lat Pulldown (Cable)",
  "jalón al pecho (cable)": "Lat Pulldown (Cable)",
  "press de pecho inclinado (máquina)": "Incline Chest Press (Machine)",
  "cables cruzados": "Cable Crossover",
};

/**
 * Gets the English translation of an exercise name.
 * Returns the original name if no translation is found.
 *
 * @param {string} localizedName - The exercise name in the user's language
 * @return {string} The English name if translation exists, otherwise the original name
 */
function getEnglishName(localizedName) {
  if (!localizedName || typeof localizedName !== "string") {
    return localizedName;
  }

  const normalized = localizedName.toLowerCase().trim();
  const translation = EXERCISE_TRANSLATIONS[normalized];

  return translation || localizedName;
}

/**
 * Checks if a translation exists for the given exercise name.
 *
 * @param {string} localizedName - The exercise name to check
 * @return {boolean} True if a translation exists
 */
function hasTranslation(localizedName) {
  if (!localizedName || typeof localizedName !== "string") {
    return false;
  }

  const normalized = localizedName.toLowerCase().trim();
  return EXERCISE_TRANSLATIONS.hasOwnProperty(normalized);
}
