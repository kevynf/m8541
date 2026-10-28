import { divmod } from "../shared/math.ts";

const LIST_STEP_DEGREES = (1.25 * 360) / 100;
const VOLUME_CLICK_DEGREES = (1.25 * 360) / 22;

export type ScrollTarget = "list" | "volume" | "seek" | "brick";

export interface ScrollApplierHandlers {
  move(step: number, count: number): boolean | undefined;
  click(count: number, target: ScrollTarget): void;
}

export interface ScrollGesture {
  step: number;
  degrees: number;
  target: ScrollTarget;
  multiplier: number;
  dragStepDegrees: number;
}

export interface ScrollApplier {
  scroll(gesture: ScrollGesture): void;
  reset(): void;
}

export function createScrollApplier({ move, click }: ScrollApplierHandlers): ScrollApplier {
  let degreeAccum = 0;
  let lastStep: number | undefined;
  let lastIsVolume: boolean | undefined;
  let volumeClickAccum = 0;
  let clicked: boolean | undefined = false;

  function reset() {
    degreeAccum = 0;
    volumeClickAccum = 0;
    clicked = false;
  }

  function applyVolume(step: number, degrees: number) {
    const stepped = divmod(degreeAccum, LIST_STEP_DEGREES);
    degreeAccum = stepped.remainder;
    if (stepped.count >= 1) {
      const moved = move(step, stepped.count);
      clicked = clicked || moved;
    }
    const tick = divmod(volumeClickAccum + degrees, VOLUME_CLICK_DEGREES);
    volumeClickAccum = tick.remainder;
    if (tick.count >= 1) {
      if (clicked) click(tick.count, "volume");
      clicked = false;
    }
  }

  function scroll({ step, degrees, target, multiplier, dragStepDegrees }: ScrollGesture) {
    const isVolume = target === "volume";
    if (step !== lastStep || isVolume !== lastIsVolume) {
      lastStep = step;
      lastIsVolume = isVolume;
      reset();
    }
    degreeAccum += degrees;
    if (isVolume) {
      applyVolume(step, degrees);
      return;
    }
    const { count, remainder } = divmod(degreeAccum, dragStepDegrees);
    degreeAccum = remainder;
    if (count >= 1 && move(step, count * multiplier)) click(count, target);
  }

  return { scroll, reset };
}
