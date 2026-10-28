import type { BacklightMode, ClickerMode, RepeatMode, ShuffleMode } from "./options.ts";

export interface Settings {
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  clicker: ClickerMode;
  backlight: BacklightMode;
  volume: number;
}

export interface StoredSettings {
  shuffle?: unknown;
  repeat?: unknown;
  clicker?: unknown;
  backlight?: unknown;
  volume?: unknown;
  backlightChosen?: unknown;
}

export type SettingsStore = {
  subscribe(run: (value: Settings) => void): () => void;
  set(next: Settings): void;
  update(updater: (value: Settings) => Settings): void;
  get(): Settings;
};
