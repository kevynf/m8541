export const Shuffle = { OFF: "off", SONGS: "songs" } as const;
export const Repeat = { OFF: "off", ONE: "one", ALL: "all" } as const;
export const Clicker = { OFF: "off", ON: "on" } as const;
export const Backlight = {
  OFF: "off",
  SEC_1: "1sec",
  SEC_2: "2sec",
  SEC_3: "3sec",
  SEC_5: "5sec",
  ALWAYS_ON: "always_on",
} as const;

export type ShuffleMode = (typeof Shuffle)[keyof typeof Shuffle];
export type RepeatMode = (typeof Repeat)[keyof typeof Repeat];
export type ClickerMode = (typeof Clicker)[keyof typeof Clicker];
export type BacklightMode = (typeof Backlight)[keyof typeof Backlight];

export interface BacklightModeOption {
  mode: BacklightMode;
  labelKey: string;
  durationMs?: number;
}

export const BACKLIGHT_MODES: readonly BacklightModeOption[] = [
  { mode: Backlight.OFF, labelKey: "ASE.Web.M8541.Backlight.Off" },
  { mode: Backlight.SEC_1, labelKey: "ASE.Web.M8541.Backlight.OneSecond", durationMs: 1000 },
  { mode: Backlight.SEC_2, labelKey: "ASE.Web.M8541.Backlight.TwoSeconds", durationMs: 2000 },
  { mode: Backlight.SEC_3, labelKey: "ASE.Web.M8541.Backlight.ThreeSeconds", durationMs: 3000 },
  { mode: Backlight.SEC_5, labelKey: "ASE.Web.M8541.Backlight.FiveSeconds", durationMs: 5000 },
  { mode: Backlight.ALWAYS_ON, labelKey: "ASE.Web.M8541.Backlight.AlwaysOn" },
];
