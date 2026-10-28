import assert from "node:assert/strict";
import { test } from "node:test";
import { getStore } from "../src/player/shared/store.ts";

const SETTINGS_KEY = "m8541:settings";

type MediaQueryListener = (event: { matches: boolean }) => void;

type SettingsModule = typeof import("../src/player/settings/store.ts");

test("settings sanitize values, honor theme overrides, survive reload, and reset", async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map<string, string>([
    [
      SETTINGS_KEY,
      JSON.stringify({
        shuffle: "invalid",
        repeat: "all",
        volume: 250,
        backlight: "always_on",
      }),
    ],
  ]);
  const readPersisted = (): Record<string, unknown> => JSON.parse(values.get(SETTINGS_KEY) ?? "{}");
  const listeners = new Set<MediaQueryListener>();
  let dark = false;
  const media = {
    get matches() {
      return dark;
    },
    addEventListener(_event: string, listener: MediaQueryListener) {
      listeners.add(listener);
    },
    removeEventListener(_event: string, listener: MediaQueryListener) {
      listeners.delete(listener);
    },
  };
  const localStorage = {
    getItem: (key: string): string | null => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { matchMedia: () => media },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });

  const modulePath = "../src/player/settings/store.ts";
  const { settings, Backlight, Repeat, Shuffle, setBacklight } = (await import(
    `${modulePath}?initial`
  )) as SettingsModule;

  assert.deepEqual(getStore(settings), {
    shuffle: Shuffle.OFF,
    repeat: Repeat.ALL,
    clicker: "on",
    backlight: Backlight.OFF,
    volume: 50,
  });

  dark = true;
  for (const listener of listeners) listener({ matches: true });
  assert.equal(getStore(settings).backlight, Backlight.ALWAYS_ON);
  setBacklight(Backlight.SEC_2);
  dark = false;
  for (const listener of listeners) listener({ matches: false });
  assert.equal(
    getStore(settings).backlight,
    Backlight.SEC_2,
    "manual setting overrides the OS theme",
  );
  settings.update((current) => ({ ...current, volume: 42 }));
  const persisted = readPersisted();
  assert.equal(persisted.backlightChosen, true);
  assert.equal(persisted.volume, 42);

  const reloaded = (await import(`${modulePath}?reloaded`)) as SettingsModule;
  assert.deepEqual(getStore(reloaded.settings), getStore(settings));

  reloaded.resetSettings();
  assert.deepEqual(getStore(reloaded.settings), {
    shuffle: Shuffle.OFF,
    repeat: Repeat.OFF,
    clicker: "on",
    backlight: Backlight.OFF,
    volume: 50,
  });
  const reset = readPersisted();
  assert.equal(reset.repeat, Repeat.OFF);
  assert.equal(reset.volume, 50);
  assert.equal(reset.backlightChosen, undefined, "reset releases the manual theme override");
});
