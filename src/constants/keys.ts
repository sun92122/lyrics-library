export const CHROMATIC_SCALE = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export type KeyName = (typeof CHROMATIC_SCALE)[number];

export const KEY_ALIASES: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "Gb": "F#",
  "G#": "Ab",
  "A#": "Bb",
};
