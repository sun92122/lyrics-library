import { CHROMATIC_SCALE, KEY_ALIASES, type KeyName } from '@/constants/keys';

/**
 * Normalizes note or key name to standard representation in CHROMATIC_SCALE.
 * Supports Unicode accidentals (♯/♭) and prefix accidentals (#F -> F#, bB -> Bb).
 */
export function normalizeNote(note: string): KeyName | string {
  if (!note) return note;
  const ascii = note.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const suffixForm = ascii.replace(/^([#b])([A-G])(.*)$/, "$2$1$3");
  const match = suffixForm.match(/^([A-G][#b]?)(.*)$/);
  if (match) {
    const mapped = KEY_ALIASES[match[1]] ?? match[1];
    return `${mapped}${match[2]}`;
  }
  return suffixForm;
}

/**
 * Parses the root note and modifier/suffix of a chord token or key name.
 * E.g., "Em7" -> { root: "E", suffix: "m7" }
 * "#Fm" -> { root: "F#", suffix: "m" }
 * "♭B" -> { root: "Bb", suffix: "" }
 */
export function parseRootAndSuffix(chordPart: string): { root: string; suffix: string } {
  if (!chordPart) return { root: '', suffix: '' };
  const ascii = chordPart.trim().replace(/♯/g, "#").replace(/♭/g, "b");
  const suffixForm = ascii.replace(/^([#b])([A-G])(.*)$/, "$2$1$3");
  const match = suffixForm.match(/^([A-G][#b]?)(.*)$/);
  if (!match) {
    return { root: chordPart, suffix: '' };
  }
  return {
    root: match[1],
    suffix: match[2] || '',
  };
}

/**
 * Transposes a single note by a given number of semitones.
 */
export function transposeNote(note: string, semitones: number): string {
  if (!note) return note;
  const normalized = normalizeNote(note);
  const index = CHROMATIC_SCALE.indexOf(normalized as KeyName);
  if (index === -1) {
    return note;
  }
  const newIndex = ((index + semitones) % 12 + 12) % 12;
  return CHROMATIC_SCALE[newIndex];
}

/**
 * Transposes a single chord string (supports slash chords like D/F#, Em7, Asus4).
 */
export function transposeChord(chord: string, semitones: number): string {
  if (!chord || semitones % 12 === 0) return chord;

  // Handle slash chords like D/F# or Am7/G
  if (chord.includes('/')) {
    const parts = chord.split('/');
    const mainChord = transposeChord(parts[0], semitones);
    const bassNote = transposeNote(parts[1], semitones);
    return `${mainChord}/${bassNote}`;
  }

  const { root, suffix } = parseRootAndSuffix(chord);
  if (!root) return chord;

  const transposedRoot = transposeNote(root, semitones);
  return `${transposedRoot}${suffix}`;
}

/**
 * Calculates the semitone distance from one key to another.
 * Returns a value in the range -5 to +6 (preferring shortest transposition direction).
 */
export function getSemitoneOffset(fromKey: string, toKey: string): number {
  if (!fromKey || !toKey) return 0;
  const fromRoot = parseRootAndSuffix(fromKey).root;
  const toRoot = parseRootAndSuffix(toKey).root;

  const normalizedFrom = normalizeNote(fromRoot);
  const normalizedTo = normalizeNote(toRoot);

  const fromIndex = CHROMATIC_SCALE.indexOf(normalizedFrom as KeyName);
  const toIndex = CHROMATIC_SCALE.indexOf(normalizedTo as KeyName);

  if (fromIndex === -1 || toIndex === -1) return 0;

  let diff = (toIndex - fromIndex) % 12;
  if (diff > 6) diff -= 12;
  if (diff < -5) diff += 12;
  return diff;
}

/**
 * Transposes a key name by a given number of semitones.
 * E.g., transposeKey("G", 2) -> "A"
 * transposeKey("Am", 2) -> "Bm"
 */
export function transposeKey(key: string, semitones: number): string {
  if (!key) return key;
  const { root, suffix } = parseRootAndSuffix(key);
  const newRoot = transposeNote(root, semitones);
  return `${newRoot}${suffix}`;
}
