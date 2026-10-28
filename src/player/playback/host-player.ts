import { subscribeStore } from "../shared/store.ts";
import type { PlaybackControls, QueueTrack, RepeatMode, Store } from "./web-audio-player.ts";

export interface HostPlayback {
  readonly isPlaying: Store<boolean>;
  readonly currentPlaybackTime: Store<number>;
  readonly currentPlaybackDuration: Store<number>;
  readonly currentItemIndex: Store<number>;
  readonly hasLoadedItem: Store<boolean>;
  readonly shuffleMode: Store<boolean>;
  readonly repeatMode: Store<RepeatMode>;
  readonly volume: Store<number>;
  readonly queuePosition?: Store<number>;
  setQueue(trackIds: readonly string[]): Promise<void> | void;
  resume(): Promise<void> | void;
  pause(): Promise<void> | void;
  seekToTime(time: number, index?: number): Promise<void> | void;
  skipToNextItem(): Promise<void> | void;
  skipToPreviousItem(): Promise<void> | void;
  changeToQueueItem(trackId: string, index: number): Promise<void> | void;
  setShuffle(shuffle: boolean): Promise<void> | void;
  setRepeatMode(mode: RepeatMode): Promise<void> | void;
  setVolume(volume: number): Promise<void> | void;
  clearQueue(): Promise<void> | void;
}

export function createHostPlayer(
  queue: readonly QueueTrack[],
  host: HostPlayback,
  onQueueAdvance?: (index: number) => void,
): PlaybackControls {
  const unsubscribe = onQueueAdvance
    ? subscribeStore(host.currentItemIndex, onQueueAdvance)
    : undefined;
  return {
    setQueue: async () => {
      await host.setQueue(queue.map((item) => item.trackId));
    },
    resume: async () => {
      await host.resume();
    },
    pause: async () => {
      await host.pause();
    },
    seekToTime: async (time, index) => {
      await host.seekToTime(time, index);
    },
    skipToNextItem: async () => {
      await host.skipToNextItem();
    },
    skipToPreviousItem: async () => {
      await host.skipToPreviousItem();
    },
    changeToQueueItem: async (trackId, index) => {
      await host.changeToQueueItem(trackId, index);
    },
    setShuffle: async (shuffle) => {
      await host.setShuffle(shuffle);
    },
    setRepeatMode: async (mode) => {
      await host.setRepeatMode(mode);
    },
    setVolume: async (volume) => {
      await host.setVolume(volume);
    },
    isPlaying: host.isPlaying,
    currentPlaybackTime: host.currentPlaybackTime,
    currentPlaybackDuration: host.currentPlaybackDuration,
    hasLoadedItem: host.hasLoadedItem,
    shuffleMode: host.shuffleMode,
    repeatMode: host.repeatMode,
    volume: host.volume,
    queuePosition: host.queuePosition ?? host.currentItemIndex,
    destroy: () => unsubscribe?.(),
  };
}
