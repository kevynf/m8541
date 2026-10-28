export const LONGPRESS_KEYS: readonly string[] = ["Enter", " "];
export const LONGPRESS_MS = 1000;
export const REPEAT_INTERVAL = 500;
export const KEYSCROLL_DELAY = 300;
export const KEYSCROLL_REPEAT = 80;
const MIN_MOVE_RATIO = 0.1;
const MIN_ACCUMULATED_DEGREES = 8;

export interface HoldTimer {
  start(duration: number, repeatInterval?: number): void;
  stop(): boolean;
}

export function createHoldTimer(callback: (repeat: boolean) => void): HoldTimer {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let interval: ReturnType<typeof setInterval> | undefined;
  let held = false;

  function clear() {
    clearTimeout(timeout);
    clearInterval(interval);
    timeout = undefined;
    interval = undefined;
  }

  function stop(): boolean {
    clear();
    const wasHeld = held;
    held = false;
    return wasHeld;
  }

  function start(duration: number, repeatInterval?: number) {
    stop();
    timeout = setTimeout(() => {
      timeout = undefined;
      held = true;
      callback(false);
      if (held && repeatInterval !== undefined)
        interval = setInterval(() => callback(true), repeatInterval);
    }, duration);
  }

  return { start, stop };
}

export interface LongpressParams {
  duration: number;
  repeatInterval?: number;
  disabled?: boolean;
  keyboard?: boolean;
}

export interface LongpressAction {
  update(params: LongpressParams): void;
  destroy(): void;
}

export function longpress(node: HTMLElement, params: LongpressParams): LongpressAction {
  let options = params;
  let activePointer: number | undefined;
  let activeKey: string | undefined;
  let consumed = false;

  const hold = createHoldTimer((repeat) => {
    if (activePointer !== undefined) consumed = true;
    node.dispatchEvent(new CustomEvent("longpress", { detail: { repeat } }));
  });

  function isActive(): boolean {
    return activePointer !== undefined || activeKey !== undefined;
  }

  function start() {
    consumed = false;
    hold.start(options.duration, options.repeatInterval);
  }

  function stop() {
    hold.stop();
    activePointer = undefined;
    activeKey = undefined;
  }

  function onPointerDown(event: PointerEvent) {
    if (options.disabled || !event.isPrimary || event.button !== 0 || isActive()) return;
    activePointer = event.pointerId;
    if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
    start();
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === activePointer) {
      activePointer = undefined;
      hold.stop();
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId === activePointer) stop();
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.pointerId === activePointer) stop();
  }

  function onContextMenu(event: MouseEvent) {
    if (activePointer !== undefined) event.preventDefault();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (options.disabled || options.keyboard === false || !LONGPRESS_KEYS.includes(event.key))
      return;
    event.preventDefault();
    if (!(event.repeat || isActive())) {
      activeKey = event.key;
      start();
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (options.disabled || options.keyboard === false || !LONGPRESS_KEYS.includes(event.key))
      return;
    event.preventDefault();
    if (event.key === activeKey) {
      activeKey = undefined;
      if (!hold.stop()) node.click();
    }
  }

  function onBlur() {
    if (activeKey !== undefined) stop();
  }

  function onWindowBlur() {
    stop();
  }

  function resetConsumed() {
    consumed = false;
  }

  function swallowClick(event: MouseEvent) {
    if (!consumed) return;
    const [target] = event.composedPath();
    if (!(target instanceof Node) || !(node.contains(target) || target.contains(node))) return;
    consumed = false;
    event.stopImmediatePropagation();
    event.preventDefault();
  }

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointerup", onPointerUp);
  node.addEventListener("pointercancel", onPointerCancel);
  node.addEventListener("pointerleave", onPointerLeave);
  node.addEventListener("contextmenu", onContextMenu);
  node.addEventListener("keydown", onKeyDown);
  node.addEventListener("keyup", onKeyUp);
  node.addEventListener("blur", onBlur);
  window.addEventListener("blur", onWindowBlur);
  window.addEventListener("pointerdown", resetConsumed, true);
  window.addEventListener("click", swallowClick, true);

  return {
    update(params) {
      options = params;
      if (options.disabled) stop();
    },
    destroy() {
      stop();
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerCancel);
      node.removeEventListener("pointerleave", onPointerLeave);
      node.removeEventListener("contextmenu", onContextMenu);
      node.removeEventListener("keydown", onKeyDown);
      node.removeEventListener("keyup", onKeyUp);
      node.removeEventListener("blur", onBlur);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("pointerdown", resetConsumed, true);
      window.removeEventListener("click", swallowClick, true);
    },
  };
}

function clearanceSq(from: Point, to: Point): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.min(1, Math.max(0, -(from.x * dx + from.y * dy) / lenSq));
  const px = from.x + t * dx;
  const py = from.y + t * dy;
  return px * px + py * py;
}

function angleOf({ x, y }: Point): number {
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function shortestAngle(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export type Sign = -1 | 1;

function signOf(degrees: number): Sign {
  return degrees > 0 ? 1 : -1;
}

function degreesPerSecond(degrees: number, ms: number): number {
  return ms > 0 ? (degrees / ms) * 1000 : 0;
}

interface Point {
  x: number;
  y: number;
}

interface WheelPoint {
  offset: Point;
  radius: number;
  withinWheel: boolean;
}

export interface WheelGestureParams {
  excludeRadiusRatio?: number;
}

export interface WheelGestureAction {
  update(params?: WheelGestureParams): void;
  destroy(): void;
}

export function wheelGesture(
  node: HTMLElement,
  { excludeRadiusRatio = 0 }: WheelGestureParams = {},
): WheelGestureAction {
  let excludeRatio = excludeRadiusRatio;
  let activePointer: number | undefined;
  let lastOffset: Point | undefined;
  let lastTime: number | undefined;
  let lastSign: Sign | undefined;
  let accumulated = 0;

  function pointAt(event: PointerEvent): WheelPoint {
    const rect = node.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    const inner = radius * excludeRatio;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const distSq = dx * dx + dy * dy;
    return {
      offset: { x: dx, y: dy },
      radius,
      withinWheel: distSq <= radius * radius + 1e-6 && distSq >= inner * inner,
    };
  }

  function onPointerDown(event: PointerEvent) {
    if (activePointer !== undefined) return;
    const { offset, withinWheel } = pointAt(event);
    if (withinWheel) {
      activePointer = event.pointerId;
      lastOffset = offset;
      lastTime = event.timeStamp;
      node.setPointerCapture?.(activePointer);
      node.dispatchEvent(new CustomEvent("wheeldragstart"));
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointer || lastOffset === undefined || lastTime === undefined)
      return;
    const { offset, radius } = pointAt(event);
    const minDist = radius * MIN_MOVE_RATIO;
    const previous = lastOffset;
    const elapsed = event.timeStamp - lastTime;
    lastOffset = offset;
    lastTime = event.timeStamp;
    if (clearanceSq(previous, offset) < minDist * minDist) return;
    const delta = shortestAngle(angleOf(previous), angleOf(offset));
    if (delta === 0) return;
    const sign = signOf(delta);
    const abs = Math.abs(delta);
    if (lastSign === undefined || sign === lastSign) {
      lastSign = sign;
      accumulated = 0;
    } else {
      accumulated += abs;
      if (accumulated < MIN_ACCUMULATED_DEGREES) return;
      lastSign = sign;
      accumulated = 0;
    }
    const speed = degreesPerSecond(abs, elapsed);
    node.dispatchEvent(
      new CustomEvent("wheelscroll", {
        detail: { step: sign, degrees: abs, speed },
      }),
    );
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerId === activePointer) {
      node.releasePointerCapture?.(activePointer);
      activePointer = undefined;
      lastOffset = undefined;
      lastTime = undefined;
      lastSign = undefined;
      accumulated = 0;
      node.dispatchEvent(new CustomEvent("wheeldragend"));
    }
  }

  node.addEventListener("pointerdown", onPointerDown);
  node.addEventListener("pointermove", onPointerMove);
  node.addEventListener("pointerup", onPointerEnd);
  node.addEventListener("pointercancel", onPointerEnd);
  node.addEventListener("lostpointercapture", onPointerEnd);

  return {
    update(params) {
      excludeRatio = params?.excludeRadiusRatio ?? 0;
    },
    destroy() {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerEnd);
      node.removeEventListener("pointercancel", onPointerEnd);
      node.removeEventListener("lostpointercapture", onPointerEnd);
    },
  };
}
