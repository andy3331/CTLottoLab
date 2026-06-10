export const CT_LOTTO_CONFIG = {
  code: "ct_lotto",
  name: "CT Lotto!",
  numberMin: 1,
  numberMax: 44,
  pickCount: 6,
} as const;

export const PICKER_MODES = [
  "random",
  "hot",
  "cold",
  "low_split",
  "balanced",
  "weighted",
  "smart",
] as const;

export type PickerMode = (typeof PICKER_MODES)[number];

export const DISCLAIMER_TEXT =
  "Lottery drawings are random. Historical frequency does not guarantee future results. These picks are generated from historical patterns and game rules for entertainment only.";
