import { createStore, getStore } from "../shared/store.ts";
import type { Store, Unsubscribe } from "../shared/store.ts";
import { settings } from "../settings/store.ts";
import { Backlight, BACKLIGHT_MODES } from "../settings/options.ts";
import type { BacklightMode } from "../settings/options.ts";
import type { Settings } from "../settings/types.ts";

const BACKLIGHT_DURATIONS = new Map<BacklightMode, number | undefined>(
  BACKLIGHT_MODES.map(({ mode, durationMs }) => [mode, durationMs] as const),
);

export interface BacklightManager {
  subscribe(run: (value: boolean) => void): Unsubscribe;
  get(): boolean;
  notifyActivity(): void;
  toggle(): void;
  destroy(): void;
}

export function createBacklightManager(): BacklightManager {
  let mode: BacklightMode = getStore(settings).backlight;
  const isBacklit: Store<boolean> = createStore(mode === Backlight.ALWAYS_ON);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pinned = false;
  let wasLit = false;
  let lit = mode === Backlight.ALWAYS_ON;

  function clearTimer() {
    clearTimeout(timer);
    timer = undefined;
  }

  function notifyActivity() {
    lit = getStore(isBacklit);
    if (pinned) return;
    if (wasLit) {
      wasLit = false;
      isBacklit.set(mode === Backlight.ALWAYS_ON);
    }
    const duration = BACKLIGHT_DURATIONS.get(mode);
    if (duration !== undefined) {
      clearTimer();
      isBacklit.set(true);
      timer = setTimeout(() => {
        timer = undefined;
        isBacklit.set(false);
      }, duration);
    }
  }

  function toggle() {
    clearTimer();
    pinned = !lit;
    wasLit = lit;
    lit = pinned;
    isBacklit.set(pinned);
  }

  const unsubscribe = settings.subscribe(({ backlight }: Settings) => {
    if (backlight === mode) return;
    mode = backlight;
    pinned = false;
    wasLit = false;
    clearTimer();
    if (mode === Backlight.ALWAYS_ON) isBacklit.set(true);
    else if (mode === Backlight.OFF) isBacklit.set(false);
    else notifyActivity();
  });

  return {
    subscribe: isBacklit.subscribe,
    get: isBacklit.get,
    notifyActivity,
    toggle,
    destroy() {
      clearTimer();
      unsubscribe();
    },
  };
}
