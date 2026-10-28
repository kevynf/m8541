const SEEK_HOLD_STEPS = [5, 5, 5, 10, 10, 10, 20];

export interface SeekStepperPlayback {
  isInert: boolean;
  isSeeking: boolean;
  hasLoadedItem: boolean;
  currentTrackIndex: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
}

export interface SeekStepper {
  step(direction: number, repeat: boolean, playback: SeekStepperPlayback): number | undefined;
  cancel(): void;
}

export function createSeekStepper(): SeekStepper {
  let anchorTime: number | undefined;
  let anchorIndex: number | undefined;
  let holdCount = 0;

  function step(direction: number, repeat: boolean, playback: SeekStepperPlayback) {
    const {
      isInert,
      isSeeking,
      hasLoadedItem,
      currentTrackIndex,
      currentPlaybackTime,
      currentPlaybackDuration,
    } = playback;

    if (!repeat) {
      anchorTime = isInert ? undefined : currentPlaybackTime;
      anchorIndex = currentTrackIndex;
      holdCount = 0;
    }
    if (
      anchorTime === undefined ||
      isInert ||
      isSeeking ||
      !hasLoadedItem ||
      currentPlaybackDuration <= 0 ||
      currentTrackIndex !== anchorIndex
    )
      return;

    const seconds = SEEK_HOLD_STEPS[Math.min(holdCount, SEEK_HOLD_STEPS.length - 1)];
    const next = Math.min(Math.max(anchorTime + direction * seconds, 0), currentPlaybackDuration);
    holdCount += 1;
    anchorTime = next > 0 && next < currentPlaybackDuration ? next : undefined;
    return next;
  }

  return {
    step,
    cancel() {
      anchorTime = undefined;
    },
  };
}
