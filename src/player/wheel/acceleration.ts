export interface ScrollCurve {
  minSpeed: number;
  tierMs: number;
  tiers: readonly number[];
}

export const SCROLL_CURVE: ScrollCurve = {
  minSpeed: 180,
  tierMs: 500,
  tiers: [1, 2, 3, 5, 8, 13, 21, 34],
};
export const SEEK_CURVE: ScrollCurve = { minSpeed: 180, tierMs: 500, tiers: [1, 2, 3, 5] };

const ACCEL_MAX_SPEED = 400;
const ACCEL_SMOOTHING = 0.15;
const ACCEL_RESET_WINDOW = 250;
const KEY_SPEED_DEGREES = 15;
const KEY_SPEED_CAP = Math.min(SCROLL_CURVE.minSpeed, SEEK_CURVE.minSpeed);

export function tierAt(curve: ScrollCurve, heldMs: number): number {
  const index = Math.min(curve.tiers.length - 1, Math.floor(heldMs / curve.tierMs));
  return curve.tiers[index];
}

export function arrowSpeed(now: number, previous: number | undefined): number {
  const elapsed = previous !== undefined ? now - previous : 0;
  return elapsed > 0 ? Math.min((KEY_SPEED_DEGREES / elapsed) * 1000, KEY_SPEED_CAP) : 0;
}

export interface Accelerator {
  next(step: number, speed: number, engaged: boolean): number;
  reset(): void;
}

export function createAccelerator(curve: ScrollCurve): Accelerator {
  let smoothed = 0;
  let lastStep: number | undefined;
  let lastAt: number | undefined;
  let tierStartedAt: number | undefined;

  function reset() {
    smoothed = 0;
    lastStep = undefined;
    lastAt = undefined;
    tierStartedAt = undefined;
  }

  function next(step: number, _speed: number, engaged: boolean): number {
    if (!engaged) {
      reset();
      return curve.tiers[0];
    }
    const now = performance.now();
    const stalled = lastAt !== undefined && now - lastAt > ACCEL_RESET_WINDOW;
    lastAt = now;
    const target = Math.min(step, ACCEL_MAX_SPEED);
    if (step !== lastStep || stalled) {
      smoothed = target;
      lastStep = step;
      tierStartedAt = undefined;
    } else {
      smoothed += ACCEL_SMOOTHING * (target - smoothed);
    }
    if (smoothed <= curve.minSpeed) {
      tierStartedAt = undefined;
      return curve.tiers[0];
    }
    tierStartedAt ??= now;
    return tierAt(curve, now - tierStartedAt);
  }

  return { next, reset };
}
