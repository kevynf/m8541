import { createStore, getStore } from "../shared/store.ts";
import { toPercent, fromPercent } from "../shared/math.ts";
import { createIdleTimer } from "../shared/timers.ts";
import { createAccelerator, tierAt, SEEK_CURVE } from "../wheel/acceleration.ts";
import type { PlaybackState, PlaybackStore } from "./store.ts";
import type { Store } from "./web-audio-player.ts";

interface IdleTimer {
  restartIdleTimer(): void;
  keepOpen(): void;
  release(): void;
  exit(): void;
  reenter(): void;
  handleScreenChange(isCurrentScreen: boolean): void;
  destroy(): void;
}

export interface SeekState {
  isSeeking: boolean;
  seekPreviewTime: number | undefined;
}

export interface SeekController {
  subscribe(run: (state: SeekState) => void): () => void;
  get(): SeekState;
  peek(): SeekState;
  toggle(): void;
  seek(delta: number): boolean;
  seekTo(seconds: number): boolean;
  commit(): void;
  keepOpen(): void;
  release(): void;
  exit(): void;
  handleDragStart(): void;
  handleDragEnd(): void;
  handleScreenChange(isCurrentScreen: boolean): void;
  accelerate(delta: number, speed: number): number;
  accelerateHold(heldMs: number): number;
  destroy(): void;
}

export interface VolumeState {
  isAdjustingVolume: boolean;
}

export interface VolumeController {
  subscribe(run: (state: VolumeState) => void): () => void;
  get(): VolumeState;
  peek(): VolumeState;
  increase(step?: number): boolean;
  decrease(step?: number): boolean;
  set(percent: number): boolean;
  keepOpen(): void;
  release(): void;
  handleScreenChange(isCurrentScreen: boolean): void;
  exit(): void;
  destroy(): void;
}

const SEEK_STATE: SeekState = { isSeeking: false, seekPreviewTime: undefined };
const VOLUME_STATE: VolumeState = { isAdjustingVolume: false };
const SEEK_COMMIT_DEBOUNCE = 1000;
const SEEK_IDLE_MS = 5000;
const SEEK_STEP_SECONDS = 1;
const VOLUME_IDLE_MS = 5000;
const VOLUME_STEP = 1;
export const VOLUME_HOLD_STEP = 5;

export function createSeekController(playback: PlaybackStore): SeekController {
  const state: Store<SeekState> = createStore(SEEK_STATE);
  const accel = createAccelerator(SEEK_CURVE);
  let pendingSeek: number | undefined;
  let commitTimer: ReturnType<typeof setTimeout> | undefined;
  let queueTrackIndex: number | undefined;
  let queueRef: PlaybackState["queue"] | undefined;
  let holding = false;
  let generation = 0;
  let idleTimer: IdleTimer;

  function peek(): SeekState {
    return state.get();
  }

  function commit() {
    clearTimeout(commitTimer);
    commitTimer = undefined;
    if (pendingSeek === undefined) return;
    const target = pendingSeek;
    pendingSeek = undefined;
    const current = ++generation;
    playback.seek(target).then(() => {
      state.update((s) => (current === generation ? { ...s, seekPreviewTime: undefined } : s));
    });
  }

  function scheduleCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, SEEK_COMMIT_DEBOUNCE);
  }

  function leave() {
    commit();
    queueTrackIndex = undefined;
    queueRef = undefined;
    holding = false;
    state.set(SEEK_STATE);
  }

  function cancelPending() {
    clearTimeout(commitTimer);
    commitTimer = undefined;
    pendingSeek = undefined;
  }

  function enter() {
    const { currentTrackIndex, queue }: PlaybackState = getStore(playback);
    queueTrackIndex = currentTrackIndex;
    queueRef = queue;
    idleTimer.restartIdleTimer();
    state.set({ isSeeking: true, seekPreviewTime: undefined });
  }

  idleTimer = createIdleTimer({
    timeoutMs: SEEK_IDLE_MS,
    isActive: () => peek().isSeeking,
    enter,
    onLeave: leave,
  });

  function toggle() {
    if (peek().isSeeking) {
      idleTimer.exit();
      return;
    }
    enter();
  }

  function release() {
    commit();
    idleTimer.release();
  }

  function previewTime(): number {
    const { currentPlaybackTime }: PlaybackState = getStore(playback);
    return peek().seekPreviewTime ?? Math.floor(currentPlaybackTime);
  }

  function seekTo(seconds: number): boolean {
    if (!peek().isSeeking) return false;
    const current = previewTime();
    const { currentPlaybackDuration }: PlaybackState = getStore(playback);
    const max = currentPlaybackDuration > 0 ? currentPlaybackDuration : Infinity;
    const clamped = Math.min(max, Math.max(0, Math.round(seconds)));
    idleTimer.restartIdleTimer();
    if (clamped === current) return false;
    pendingSeek = clamped;
    generation += 1;
    if (!holding) scheduleCommit();
    state.update((s) => ({ ...s, seekPreviewTime: clamped }));
    return true;
  }

  function seekBy(delta: number): boolean {
    return seekTo(previewTime() + delta * SEEK_STEP_SECONDS);
  }

  function accelerate(delta: number, speed: number): number {
    const { isSeeking } = peek();
    if (isSeeking) idleTimer.restartIdleTimer();
    return accel.next(delta, speed, isSeeking);
  }

  function accelerateHold(heldMs: number): number {
    return tierAt(SEEK_CURVE, heldMs);
  }

  function handleDragStart() {
    holding = true;
    clearTimeout(commitTimer);
    commitTimer = undefined;
  }

  function handleDragEnd() {
    holding = false;
    if (pendingSeek !== undefined) scheduleCommit();
  }

  const unsubscribe = playback.subscribe(
    ({ currentTrackIndex, queue, currentPlaybackDuration, hasLoadedItem }: PlaybackState) => {
      if (!peek().isSeeking) return;
      if (currentTrackIndex !== queueTrackIndex || queue !== queueRef) {
        cancelPending();
        if (hasLoadedItem) idleTimer.reenter();
        else idleTimer.exit();
        return;
      }
      const { seekPreviewTime } = peek();
      if (
        currentPlaybackDuration > 0 &&
        seekPreviewTime !== undefined &&
        seekPreviewTime > currentPlaybackDuration
      ) {
        if (pendingSeek !== undefined) pendingSeek = currentPlaybackDuration;
        state.update((s) => ({ ...s, seekPreviewTime: currentPlaybackDuration }));
      }
    },
  );

  function destroy() {
    commit();
    idleTimer.destroy();
    unsubscribe();
  }

  return {
    subscribe: state.subscribe,
    get: state.get,
    peek,
    toggle,
    seek: seekBy,
    seekTo,
    commit,
    keepOpen: idleTimer.keepOpen,
    release,
    exit: idleTimer.exit,
    handleDragStart,
    handleDragEnd,
    handleScreenChange: idleTimer.handleScreenChange,
    accelerate,
    accelerateHold,
    destroy,
  };
}

export function createVolumeController(playback: PlaybackStore): VolumeController {
  const state: Store<VolumeState> = createStore(VOLUME_STATE);

  function peek(): VolumeState {
    return state.get();
  }

  function enter() {
    state.update((s) => ({ ...s, isAdjustingVolume: true }));
  }

  const idleTimer = createIdleTimer({
    timeoutMs: VOLUME_IDLE_MS,
    isActive: () => peek().isAdjustingVolume,
    enter,
    onLeave: () => state.set(VOLUME_STATE),
  });

  function touch() {
    idleTimer.restartIdleTimer();
    if (!peek().isAdjustingVolume) enter();
  }

  function set(percent: number): boolean {
    const { volume }: PlaybackState = getStore(playback);
    const current = toPercent(volume);
    const clamped = Math.min(100, Math.max(0, percent));
    touch();
    if (clamped === current) return false;
    playback.setVolume(fromPercent(clamped));
    return true;
  }

  function step(delta: number): boolean {
    const { volume }: PlaybackState = getStore(playback);
    return set(toPercent(volume) + delta * VOLUME_STEP);
  }

  return {
    subscribe: state.subscribe,
    get: state.get,
    peek,
    increase: (n = 1) => step(n),
    decrease: (n = 1) => step(-n),
    set,
    keepOpen: idleTimer.keepOpen,
    release: idleTimer.release,
    handleScreenChange: idleTimer.handleScreenChange,
    exit: idleTimer.exit,
    destroy: idleTimer.destroy,
  };
}
