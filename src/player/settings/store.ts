import { createStore, getStore } from "../shared/store.ts";
import type { Settings, SettingsStore, StoredSettings } from "./types.ts";
import type { BacklightMode } from "./options.ts";
import { Shuffle, Repeat, Clicker, Backlight } from "./options.ts";

export { Shuffle, Repeat, Clicker, Backlight } from "./options.ts";

export function getSettings(): Settings {
  return getStore(settings);
}

const STORAGE_KEY = "m8541:settings";

const darkMode: MediaQueryList | undefined =
  typeof window === "undefined" || !window.matchMedia
    ? undefined
    : window.matchMedia("(prefers-color-scheme: dark)");

function preferredBacklight(): BacklightMode {
  return darkMode && darkMode.matches ? Backlight.ALWAYS_ON : Backlight.OFF;
}

function isMember<T extends string>(enumObj: Record<string, T>, value: unknown): value is T {
  return Object.values(enumObj).includes(value as T);
}

function isVolume(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

const defaults: Settings = Object.freeze({
  shuffle: Shuffle.OFF,
  repeat: Repeat.OFF,
  clicker: Clicker.ON,
  backlight: preferredBacklight(),
  volume: 50,
});

let backlightChosen = false;

function sanitize(stored: StoredSettings | undefined): Settings {
  const t: StoredSettings = stored ?? {};
  return {
    shuffle: isMember(Shuffle, t.shuffle) ? t.shuffle : defaults.shuffle,
    repeat: isMember(Repeat, t.repeat) ? t.repeat : defaults.repeat,
    clicker: isMember(Clicker, t.clicker) ? t.clicker : defaults.clicker,
    backlight: isMember(Backlight, t.backlight) ? t.backlight : defaults.backlight,
    volume: isVolume(t.volume) ? t.volume : defaults.volume,
  };
}

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: StoredSettings | undefined = raw === null ? undefined : JSON.parse(raw);
    backlightChosen = parsed?.backlightChosen === true && isMember(Backlight, parsed.backlight);
    const merged = parsed === undefined ? defaults : sanitize(parsed);
    return backlightChosen ? merged : { ...merged, backlight: preferredBacklight() };
  } catch (e) {
    console.error("Failed to read settings from localStorage", e);
    return defaults;
  }
}

function persist({ backlight, ...rest }: Settings): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(backlightChosen ? { ...rest, backlight, backlightChosen: true } : rest),
    );
  } catch (e) {
    console.error("Failed to write settings to localStorage", e);
  }
}

export const settings: SettingsStore = createStore(readSettings());
settings.subscribe(persist);

if (darkMode) {
  darkMode.addEventListener("change", () => {
    if (!backlightChosen) settings.update((s) => ({ ...s, backlight: preferredBacklight() }));
  });
}

export function setBacklight(mode: BacklightMode): void {
  backlightChosen = true;
  settings.update((s) => ({ ...s, backlight: mode }));
}

const backlightListeners = new Set<() => void>();
export function onBacklightChange(listener: () => void): () => void {
  backlightListeners.add(listener);
  return () => backlightListeners.delete(listener);
}

export function resetSettings(): void {
  backlightChosen = false;
  settings.set({ ...defaults, backlight: preferredBacklight() });
  for (const listener of backlightListeners) listener();
}
