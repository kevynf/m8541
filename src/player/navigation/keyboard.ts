import { createHoldTimer, LONGPRESS_MS } from "../wheel/gestures.ts";

const MENU_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowRight",
  "ArrowLeft",
  "Enter",
  " ",
  "Escape",
]);
const INPUT_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowRight",
  "ArrowLeft",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

export type ScreenKeyMode = "list" | "now-playing" | "passthrough";

export interface ArrowKeyEvent {
  readonly timeStamp: number;
}

export interface ScreenKeysOptions {
  disabled: boolean;
  navigationId: number;
  mode: ScreenKeyMode;
  onArrow(event: ArrowKeyEvent, direction: number): void;
  onSelect(): void;
  onBack(): void;
  onMenuHold(): void;
}

export interface ScreenKeysAction {
  update(next: ScreenKeysOptions): void;
  destroy(): void;
}

function swallow(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function screenKeys(node: HTMLElement, options: ScreenKeysOptions): ScreenKeysAction {
  let opts = options;
  const hold = createHoldTimer(() => opts.onMenuHold());
  let holding = false;

  function cancel() {
    holding = false;
    hold.stop();
  }

  function startHold(event: KeyboardEvent) {
    swallow(event);
    if (event.repeat) return;
    holding = true;
    hold.start(LONGPRESS_MS);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (opts.mode === "passthrough") return;
    if (opts.disabled) {
      if (MENU_KEYS.has(event.key) || INPUT_KEYS.has(event.key)) swallow(event);
      return;
    }
    if (opts.mode === "now-playing" && event.key !== "Escape") {
      const inRange = event.target instanceof HTMLInputElement && INPUT_KEYS.has(event.key);
      const inLink = event.target instanceof HTMLAnchorElement && event.key === "Enter";
      const letThrough = inRange || inLink;
      if (letThrough || MENU_KEYS.has(event.key)) {
        event.stopPropagation();
        if (!letThrough) event.preventDefault();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        swallow(event);
        opts.onArrow(event, 1);
        break;
      case "ArrowUp":
        swallow(event);
        opts.onArrow(event, -1);
        break;
      case "ArrowRight":
      case "ArrowLeft":
        swallow(event);
        break;
      case "Enter":
      case " ":
        swallow(event);
        if (!event.repeat) opts.onSelect();
        break;
      case "Escape":
        startHold(event);
        break;
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.key !== "Escape" || !holding) return;
    holding = false;
    if (!hold.stop()) opts.onBack();
  }

  node.addEventListener("keydown", onKeyDown);
  node.addEventListener("keyup", onKeyUp);
  node.addEventListener("focusout", cancel);
  window.addEventListener("blur", cancel);

  return {
    update(next) {
      const navigationChanged = next.navigationId !== opts.navigationId;
      opts = next;
      if (opts.disabled || navigationChanged) cancel();
    },
    destroy() {
      node.removeEventListener("keydown", onKeyDown);
      node.removeEventListener("keyup", onKeyUp);
      node.removeEventListener("focusout", cancel);
      window.removeEventListener("blur", cancel);
      cancel();
    },
  };
}
