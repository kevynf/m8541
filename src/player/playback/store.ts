import { createStore, subscribeStore } from "../shared/store.ts";
import { createLogger } from "../shared/logger.ts";
import { FallbackPlayer } from "./web-audio-player.ts";
import type { PlaybackControls, QueueTrack, RepeatMode, Store } from "./web-audio-player.ts";
import { createHostPlayer } from "./host-player.ts";
import type { HostPlayback } from "./host-player.ts";

export interface PlaybackTrack {
  id: string;
  previewUrl?: string;
  name?: string;
  artistName?: string;
  albumName?: string;
  url?: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  currentTrackIndex: number;
  queuePosition: number;
  queue: readonly PlaybackTrack[];
  hasLoadedItem: boolean;
  isLoading: boolean;
  volume: number;
  shuffleMode: boolean;
  repeatMode: RepeatMode;
  playerReady: boolean;
}

export interface PlaybackStore {
  subscribe(run: (state: PlaybackState) => void): () => void;
  get(): PlaybackState;
  play(items: readonly PlaybackTrack[], index?: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skipNext(): Promise<void>;
  skipPrevious(): Promise<void>;
  seek(time: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setShuffle(shuffle: boolean): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setPlayback(host: HostPlayback): void;
  clearQueue(): Promise<void>;
  onQueueFinished(listener: () => void): () => void;
  destroy(): void;
}

type MirroredProp =
  | "isPlaying"
  | "currentPlaybackTime"
  | "currentPlaybackDuration"
  | "hasLoadedItem"
  | "shuffleMode"
  | "repeatMode"
  | "queuePosition";

const INITIAL_STATE: PlaybackState = {
  isPlaying: false,
  currentPlaybackTime: 0,
  currentPlaybackDuration: 0,
  currentTrackIndex: 0,
  queuePosition: 0,
  queue: [],
  hasLoadedItem: false,
  isLoading: false,
  volume: 1,
  shuffleMode: false,
  repeatMode: "none",
  playerReady: false,
};
const MIRRORED_PROPS: readonly MirroredProp[] = [
  "isPlaying",
  "currentPlaybackTime",
  "currentPlaybackDuration",
  "hasLoadedItem",
  "shuffleMode",
  "repeatMode",
  "queuePosition",
];
const logger = createLogger("<PlaybackStore>");

export function createPlaybackStore(audioContext?: AudioContext): PlaybackStore {
  const state: Store<PlaybackState> = createStore(INITIAL_STATE);
  let hostPlayback: HostPlayback | undefined;
  let player: PlaybackControls | undefined;
  let playerSubscriptions: (() => void)[] = [];
  let shuffle = false;
  let repeatMode: RepeatMode = "none";
  let volumeDepth = 0;
  let abortController: AbortController | undefined;
  const queueFinishedListeners = new Set<() => void>();

  function onQueueFinished(listener: () => void) {
    queueFinishedListeners.add(listener);
    return () => queueFinishedListeners.delete(listener);
  }

  function teardownPlayer() {
    playerSubscriptions.forEach((unsubscribe) => unsubscribe());
    playerSubscriptions = [];
    try {
      player?.destroy();
    } finally {
      player = undefined;
      state.update((s) => ({ ...s, playerReady: false }));
    }
  }

  let chain: Promise<void> = Promise.resolve();

  function reportError(error: unknown) {
    logger.error("Playback control failed", error);
  }

  function enqueue(action: () => void | Promise<void>) {
    chain = chain.then(async () => {
      try {
        await (action() ?? Promise.resolve());
      } catch (error) {
        reportError(error);
      }
    });
    return chain;
  }

  function clearQueue() {
    abortController?.abort();
    state.update((s) => ({
      ...s,
      queue: [],
      currentTrackIndex: 0,
      queuePosition: 0,
      hasLoadedItem: false,
      isPlaying: false,
      isLoading: false,
    }));
    return enqueue(() => {
      teardownPlayer();
      return hostPlayback?.clearQueue();
    });
  }

  function mirrorProp(key: MirroredProp, store: Store<PlaybackState[MirroredProp]>) {
    return subscribeStore(store, (value: PlaybackState[MirroredProp]) =>
      state.update((s) => ({ ...s, [key]: value })),
    );
  }

  function watchQueueEnd(player: PlaybackControls, signal: AbortSignal) {
    let loaded = false;
    return subscribeStore(player.hasLoadedItem, (hasItem: boolean) => {
      if (loaded && !hasItem && !signal.aborted && state.get().queue.length > 0) {
        clearQueue();
        queueFinishedListeners.forEach((listener) => {
          try {
            listener();
          } catch (error) {
            logger.error("onQueueFinished listener failed", error);
          }
        });
      }
      loaded = hasItem;
    });
  }

  function bindPlayer(newPlayer: PlaybackControls, signal: AbortSignal) {
    playerSubscriptions = [watchQueueEnd(newPlayer, signal)];
    for (const key of MIRRORED_PROPS) playerSubscriptions.push(mirrorProp(key, newPlayer[key]));
    playerSubscriptions.push(
      subscribeStore(newPlayer.volume, (volume: number) => {
        if (volumeDepth > 0) return;
        state.update((s) => ({ ...s, volume }));
      }),
    );
    state.update((s) => ({ ...s, playerReady: true }));
  }

  async function startQueue(items: readonly PlaybackTrack[], index: number, autoplay: boolean) {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    const shuffleSnapshot = shuffle;
    const repeatSnapshot = repeatMode;
    const tracks = items.map(
      (song): QueueTrack => ({
        trackId: song.id,
        previewUrl: song.previewUrl ?? "",
      }),
    );
    state.update((s) => ({
      ...s,
      queue: items,
      currentTrackIndex: index,
      queuePosition: shuffleSnapshot ? 0 : index,
      isLoading: true,
    }));
    const run = async () => {
      if (controller.signal.aborted) return;
      try {
        teardownPlayer();
        const newPlayer = hostPlayback
          ? createHostPlayer(tracks, hostPlayback, setCurrentTrackIndex)
          : new FallbackPlayer(tracks, audioContext ?? new AudioContext(), setCurrentTrackIndex, {
              shuffle: shuffleSnapshot,
              repeatMode: repeatSnapshot,
            });
        player = newPlayer;
        await setVolume(state.get().volume);
        await newPlayer.setQueue();
        if (controller.signal.aborted) return;
        await newPlayer.changeToQueueItem(tracks[index]?.trackId ?? "", index);
        if (controller.signal.aborted) return;
        await Promise.all([
          newPlayer.setShuffle(shuffleSnapshot).catch(reportError),
          newPlayer.setRepeatMode(repeatSnapshot).catch(reportError),
        ]);
        if (controller.signal.aborted) return;
        if (autoplay) await newPlayer.resume();
        else await newPlayer.pause();
        if (controller.signal.aborted) return;
        await setVolume(state.get().volume);
        bindPlayer(newPlayer, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted) logger.error("Failed to start playback", error);
      } finally {
        if (!controller.signal.aborted) state.update((s) => ({ ...s, isLoading: false }));
      }
    };
    chain = chain.then(run);
    return chain;
  }

  async function setVolume(volume: number) {
    volumeDepth += 1;
    state.update((s) => ({ ...s, volume }));
    try {
      await player?.setVolume(volume);
    } catch (error) {
      reportError(error);
    } finally {
      volumeDepth -= 1;
    }
  }

  function setCurrentTrackIndex(index: number) {
    state.update((s) => {
      if (index < 0 || index >= s.queue.length) {
        logger.warn("Ignoring out-of-range queue advance index:", index);
        return s;
      }
      return { ...s, currentTrackIndex: index };
    });
  }

  function play(items: readonly PlaybackTrack[], index?: number) {
    if (items.length === 0) return Promise.resolve();
    const startIndex = index ?? (shuffle ? Math.floor(Math.random() * items.length) : 0);
    return startQueue(items, startIndex, true);
  }

  function seek(time: number) {
    const current = state.get().currentTrackIndex;
    return enqueue(() => player?.seekToTime(time, current));
  }

  function setShuffleMode(next: boolean) {
    shuffle = next;
    return enqueue(() => player?.setShuffle(next));
  }

  function setRepeatMode(next: RepeatMode) {
    repeatMode = next;
    return enqueue(() => player?.setRepeatMode(next));
  }

  function setPlayback(host: HostPlayback) {
    if (host === hostPlayback) return;
    hostPlayback = host;
    const { queue, currentTrackIndex, isPlaying } = state.get();
    if (queue.length !== 0) startQueue(queue, currentTrackIndex, isPlaying);
  }

  function destroy() {
    abortController?.abort();
    teardownPlayer();
    queueFinishedListeners.clear();
  }

  return {
    subscribe: state.subscribe,
    get: state.get,
    play,
    pause: () => enqueue(() => player?.pause()),
    resume: () => enqueue(() => player?.resume()),
    skipNext: () => enqueue(() => player?.skipToNextItem()),
    skipPrevious: () => enqueue(() => player?.skipToPreviousItem()),
    seek,
    setVolume,
    setShuffle: setShuffleMode,
    setRepeatMode,
    setPlayback,
    clearQueue,
    onQueueFinished,
    destroy,
  };
}
