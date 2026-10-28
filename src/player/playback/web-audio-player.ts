import { createStore } from "../shared/store.ts";
import { createLogger } from "../shared/logger.ts";

const logger = createLogger("<WebAudioPlayer>");
const FADE_SECONDS = 2;
const FADE_CURVE_STEPS = 50;
const RESTART_THRESHOLD = 3;

export type RepeatMode = "none" | "one" | "all";

export interface Store<T> {
  subscribe(run: (value: T) => void): () => void;
  set(next: T): void;
  update(updater: (value: T) => T): void;
  get(): T;
}

export interface QueueTrack {
  trackId: string;
  previewUrl: string;
}

export interface PlaybackControls {
  setQueue(): Promise<void>;
  resume(): Promise<void>;
  pause(): Promise<void>;
  seekToTime(time: number, index?: number): Promise<void>;
  skipToNextItem(): Promise<void>;
  skipToPreviousItem(): Promise<void>;
  changeToQueueItem(trackId: string, index: number): Promise<void>;
  setShuffle(shuffle: boolean): Promise<void>;
  setRepeatMode(mode: RepeatMode): Promise<void>;
  setVolume(volume: number): Promise<void>;
  readonly isPlaying: Store<boolean>;
  readonly currentPlaybackTime: Store<number>;
  readonly currentPlaybackDuration: Store<number>;
  readonly hasLoadedItem: Store<boolean>;
  readonly shuffleMode: Store<boolean>;
  readonly repeatMode: Store<RepeatMode>;
  readonly volume: Store<number>;
  readonly queuePosition: Store<number>;
  destroy(): void;
}

export interface FallbackPlayerOptions {
  shuffle?: boolean;
  repeatMode?: RepeatMode;
}

interface PendingCrossfade {
  channel: Channel;
  index: number;
}

function shuffled(indices: readonly number[]): number[] {
  const list = [...indices];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function sampleCurve(curve: (x: number) => number, steps: number) {
  return Float32Array.from({ length: steps }, (_, i) => curve(i / (steps - 1)));
}
const fadeInCurve = (x: number) => Math.cos((1 - x) * Math.PI * 0.5);
const fadeOutCurve = (x: number) => Math.cos(x * Math.PI * 0.5);
const FADE_IN = sampleCurve(fadeInCurve, FADE_CURVE_STEPS);
const FADE_OUT = sampleCurve(fadeOutCurve, FADE_CURVE_STEPS);

class Channel {
  readonly audio: HTMLAudioElement;
  readonly context: AudioContext;
  readonly gainNode: GainNode;
  readonly sourceNode: MediaElementAudioSourceNode;
  private fadeDoneTimeout: ReturnType<typeof setTimeout> | undefined;

  constructor(context: AudioContext, song: QueueTrack, output: AudioNode) {
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    this.audio.src = song.previewUrl;
    this.context = context;
    this.gainNode = context.createGain();
    this.gainNode.gain.value = 0;
    this.sourceNode = context.createMediaElementSource(this.audio);
    this.sourceNode.connect(this.gainNode).connect(output);
  }

  cancelPendingFade() {
    clearTimeout(this.fadeDoneTimeout);
    this.gainNode.gain.cancelScheduledValues(this.context.currentTime);
  }

  runFade(curve: Float32Array, done?: () => void) {
    this.cancelPendingFade();
    this.gainNode.gain.setValueCurveAtTime(curve, this.context.currentTime, FADE_SECONDS);
    if (done) this.fadeDoneTimeout = setTimeout(done, FADE_SECONDS * 1000);
  }

  fadeIn() {
    this.runFade(FADE_IN);
  }

  fadeOut(done?: () => void) {
    this.runFade(FADE_OUT, done);
  }

  cutIn() {
    this.cancelPendingFade();
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
  }

  destroy() {
    clearTimeout(this.fadeDoneTimeout);
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.sourceNode.disconnect();
    this.gainNode.disconnect();
  }
}

export class FallbackPlayer implements PlaybackControls {
  private readonly items: readonly QueueTrack[];
  private readonly context: AudioContext;
  private readonly onQueueAdvance: ((index: number) => void) | undefined;
  private currentIndex = 0;
  private hasTriggeredFadeForCurrent = false;
  private isShuffled: boolean;
  private currentRepeatMode: RepeatMode;
  private playOrder: number[] = [];
  private readonly fadingOutChannels = new Set<Channel>();
  private currentChannel: Channel | undefined;
  private nextChannel: Channel | undefined;
  private nextIndex: number | undefined;
  private displayChannel: Channel | undefined;
  private pendingCrossfadeFrom: PendingCrossfade | undefined;
  private readonly isPlayingStore: Store<boolean> = createStore(false);
  private readonly currentPlaybackTimeStore: Store<number> = createStore(0);
  private readonly currentPlaybackDurationStore: Store<number> = createStore(0);
  private readonly hasLoadedItemStore: Store<boolean> = createStore(false);
  private readonly shuffleModeStore: Store<boolean> = createStore(false);
  private readonly repeatModeStore: Store<RepeatMode> = createStore("none");
  private readonly volumeStore: Store<number> = createStore(1);
  private readonly queuePositionStore: Store<number> = createStore(0);
  readonly isPlaying: Store<boolean> = this.isPlayingStore;
  readonly currentPlaybackTime: Store<number> = this.currentPlaybackTimeStore;
  readonly currentPlaybackDuration: Store<number> = this.currentPlaybackDurationStore;
  readonly hasLoadedItem: Store<boolean> = this.hasLoadedItemStore;
  readonly shuffleMode: Store<boolean> = this.shuffleModeStore;
  readonly repeatMode: Store<RepeatMode> = this.repeatModeStore;
  readonly volume: Store<number> = this.volumeStore;
  readonly queuePosition: Store<number> = this.queuePositionStore;
  private readonly volumeGainNode: GainNode;

  constructor(
    items: readonly QueueTrack[],
    context: AudioContext,
    onQueueAdvance: ((index: number) => void) | undefined,
    { shuffle = false, repeatMode = "none" }: FallbackPlayerOptions = {},
  ) {
    this.items = items;
    this.context = context;
    this.onQueueAdvance = onQueueAdvance;
    this.volumeGainNode = context.createGain();
    this.volumeGainNode.connect(context.destination);
    this.isShuffled = shuffle;
    this.shuffleModeStore.set(shuffle);
    this.currentRepeatMode = repeatMode;
    this.repeatModeStore.set(repeatMode);
  }

  async setQueue() {
    this.destroyActiveChannels();
    this.currentIndex = 0;
    this.hasTriggeredFadeForCurrent = false;
    this.queuePositionStore.set(0);
  }

  private destroyActiveChannels() {
    this.currentChannel?.destroy();
    this.clearNextChannel();
    this.setCurrentChannel(undefined);
    this.displayChannel = undefined;
  }

  private clearNextChannel() {
    this.nextChannel?.destroy();
    this.nextChannel = undefined;
    this.nextIndex = undefined;
  }

  private makeNextChannelCurrent() {
    this.setCurrentChannel(this.nextChannel);
    this.nextChannel = undefined;
    this.nextIndex = undefined;
  }

  private destroyFadingChannels() {
    this.fadingOutChannels.forEach((channel) => channel.destroy());
    this.fadingOutChannels.clear();
  }

  private setCurrentChannel(channel: Channel | undefined) {
    this.currentChannel = channel;
    this.hasLoadedItemStore.set(!!channel);
  }

  private createChannel(index: number): Channel | undefined {
    const song = this.items[index];
    if (!song) return undefined;
    const channel = new Channel(this.context, song, this.volumeGainNode);
    this.bindChannelEvents(channel);
    return channel;
  }

  private setDuration(audio: HTMLAudioElement) {
    const duration = this.currentPlaybackDurationStore.get();
    if (Number.isFinite(audio.duration) && audio.duration !== duration) {
      this.currentPlaybackDurationStore.set(audio.duration);
    }
  }

  private syncStoresToChannel(channel: Channel | undefined) {
    this.currentPlaybackTimeStore.set(channel?.audio.currentTime ?? 0);
    this.currentPlaybackDurationStore.set(
      channel && Number.isFinite(channel.audio.duration) ? channel.audio.duration : 0,
    );
  }

  private promoteToDisplayIfNeeded(channel: Channel | undefined) {
    if (channel === this.displayChannel) return;
    this.displayChannel = channel;
    this.syncStoresToChannel(channel);
    this.onQueueAdvance?.(this.currentIndex);
    this.syncQueuePosition();
    this.pendingCrossfadeFrom = undefined;
  }

  private bindChannelEvents(channel: Channel) {
    channel.audio.addEventListener("durationchange", () => {
      if (channel === this.displayChannel) this.setDuration(channel.audio);
    });
    channel.audio.addEventListener("timeupdate", () => {
      if (channel === this.currentChannel && channel.audio.currentTime >= FADE_SECONDS / 2) {
        this.promoteToDisplayIfNeeded(channel);
      }
      if (channel === this.displayChannel) {
        this.currentPlaybackTimeStore.set(channel.audio.currentTime);
        this.setDuration(channel.audio);
      }
      if (channel !== this.currentChannel) return;
      const { currentTime, duration } = channel.audio;
      if (
        !Number.isFinite(duration) ||
        duration <= FADE_SECONDS ||
        this.hasTriggeredFadeForCurrent ||
        currentTime < duration - FADE_SECONDS
      ) {
        return;
      }
      this.hasTriggeredFadeForCurrent = true;
      if (this.nextChannel) this.crossfadeToNext();
      else channel.fadeOut();
    });
    channel.audio.addEventListener("ended", () => {
      if (channel !== this.currentChannel) return;
      this.promoteToDisplayIfNeeded(channel);
      if (this.nextChannel) {
        this.crossfadeToNext();
        return;
      }
      this.endQueue();
    });
  }

  private endQueue() {
    this.destroyActiveChannels();
    this.destroyFadingChannels();
    this.pendingCrossfadeFrom = undefined;
    this.isPlayingStore.set(false);
    this.syncStoresToChannel(undefined);
  }

  private computeAutoAdvanceIndex(fromIndex: number): number | undefined {
    return this.currentRepeatMode === "one" ? fromIndex : this.computeAdjacentIndex(fromIndex, 1);
  }

  private displayedIndex(): number {
    return this.pendingCrossfadeFrom?.index ?? this.currentIndex;
  }

  private syncQueuePosition(index: number = this.currentIndex) {
    this.queuePositionStore.set(this.isShuffled ? this.playOrder.indexOf(index) : index);
  }

  private computeAdjacentIndex(index: number, direction: number): number | undefined {
    if (!this.isShuffled) {
      const adjacent = index + direction;
      if (adjacent >= 0 && adjacent < this.items.length) return adjacent;
      if (this.currentRepeatMode !== "all") return undefined;
      return direction === 1 ? 0 : this.items.length - 1;
    }
    const position = this.playOrder.indexOf(index) + direction;
    if (position >= 0 && position < this.playOrder.length) return this.playOrder[position];
    if (this.currentRepeatMode !== "all") return undefined;
    const wrapped = direction === 1 ? 0 : this.playOrder.length - 1;
    return this.playOrder[wrapped];
  }

  private prepareNextChannel() {
    if (!this.currentChannel) return;
    const next = this.computeAutoAdvanceIndex(this.currentIndex);
    if (next === this.nextIndex) return;
    this.clearNextChannel();
    if (next !== undefined) {
      this.nextIndex = next;
      this.nextChannel = this.createChannel(next);
    }
  }

  private crossfadeToNext() {
    const outgoing = this.currentChannel;
    const incoming = this.nextChannel;
    if (!outgoing || !incoming || this.nextIndex === undefined) return;
    this.pendingCrossfadeFrom ??= {
      channel: outgoing,
      index: this.currentIndex,
    };
    outgoing.fadeOut(() => {
      outgoing.destroy();
      this.fadingOutChannels.delete(outgoing);
      if (this.pendingCrossfadeFrom?.channel === outgoing) {
        this.pendingCrossfadeFrom = undefined;
        if (this.currentChannel) this.promoteToDisplayIfNeeded(this.currentChannel);
      } else if (incoming === this.currentChannel) {
        this.promoteToDisplayIfNeeded(incoming);
      }
    });
    this.fadingOutChannels.add(outgoing);
    incoming.audio.play().catch((error: unknown) => {
      logger.error("Failed to play next track during crossfade", error);
      if (incoming === this.currentChannel) {
        this.isPlayingStore.set(false);
        this.promoteToDisplayIfNeeded(incoming);
      }
    });
    incoming.fadeIn();
    this.currentIndex = this.nextIndex;
    this.makeNextChannelCurrent();
    this.hasTriggeredFadeForCurrent = false;
    this.prepareNextChannel();
  }

  private revertPendingCrossfade() {
    const pending = this.pendingCrossfadeFrom;
    if (!pending) return;
    this.pendingCrossfadeFrom = undefined;
    this.currentChannel?.destroy();
    pending.channel.cutIn();
    this.fadingOutChannels.delete(pending.channel);
    this.destroyFadingChannels();
    this.currentIndex = pending.index;
    this.setCurrentChannel(pending.channel);
    this.clearNextChannel();
    this.hasTriggeredFadeForCurrent = false;
    this.syncQueuePosition();
    this.prepareNextChannel();
  }

  async resume() {
    const channel = this.currentChannel;
    if (!channel) {
      await this.jumpTo(this.currentIndex, { forceResume: true });
      return;
    }
    await channel.audio.play();
    channel.cutIn();
    this.hasTriggeredFadeForCurrent = false;
    this.isPlayingStore.set(true);
  }

  async pause() {
    this.currentChannel?.audio.pause();
    this.fadingOutChannels.forEach((channel) => channel.audio.pause());
    this.isPlayingStore.set(false);
  }

  private restartIfRepeatOne(): boolean {
    if (this.currentRepeatMode !== "one") return false;
    if (this.currentChannel) this.restartInPlace(this.currentChannel);
    return true;
  }

  async skipToNextItem() {
    if (this.restartIfRepeatOne()) return;
    const next = this.computeAdjacentIndex(this.currentIndex, 1);
    if (next !== undefined) {
      await this.jumpTo(next);
      return;
    }
    if (!this.pendingCrossfadeFrom && this.currentChannel) this.endQueue();
  }

  async skipToPreviousItem() {
    if (this.restartIfRepeatOne()) return;
    const channel = this.currentChannel;
    const playing = this.isPlayingStore.get();
    if (channel && playing && channel.audio.currentTime > RESTART_THRESHOLD) {
      this.restartInPlace(channel);
      return;
    }
    const previous = this.computeAdjacentIndex(this.currentIndex, -1);
    if (previous !== undefined) {
      await this.jumpTo(previous);
      return;
    }
    if (!this.pendingCrossfadeFrom && channel) this.endQueue();
  }

  private restartInPlace(channel: Channel) {
    channel.audio.currentTime = 0;
    channel.cutIn();
    this.hasTriggeredFadeForCurrent = false;
    this.pendingCrossfadeFrom = undefined;
    this.syncStoresToChannel(channel);
  }

  async changeToQueueItem(_trackId: string, index: number) {
    await this.jumpTo(index, { forceResume: true });
  }

  async jumpTo(index: number, { forceResume = false }: { forceResume?: boolean } = {}) {
    if (
      (index === this.currentIndex && this.currentChannel) ||
      index < 0 ||
      index >= this.items.length
    ) {
      return;
    }
    const shouldPlay = forceResume || this.isPlayingStore.get();
    this.pendingCrossfadeFrom = undefined;
    if (index === this.nextIndex && this.nextChannel) {
      this.currentChannel?.destroy();
      this.makeNextChannelCurrent();
    } else {
      this.currentChannel?.destroy();
      this.clearNextChannel();
      this.setCurrentChannel(this.createChannel(index));
    }
    this.displayChannel = this.currentChannel;
    this.syncStoresToChannel(this.currentChannel);
    this.currentIndex = index;
    this.hasTriggeredFadeForCurrent = false;
    if (this.isShuffled && this.playOrder.length === 0) this.buildPlayOrder([index]);
    this.syncQueuePosition();
    this.prepareNextChannel();
    this.onQueueAdvance?.(this.currentIndex);
    if (shouldPlay) await this.resume();
  }

  async seekToTime(time: number, index?: number) {
    if (
      (index !== undefined &&
        index !== this.currentIndex &&
        index !== this.pendingCrossfadeFrom?.index) ||
      (index !== undefined && index !== this.currentIndex)
    ) {
      this.revertPendingCrossfade();
      if (index !== undefined && index !== this.currentIndex) return;
    }
    const channel = this.currentChannel;
    if (!channel) return;
    const { duration } = channel.audio;
    const autoAdvance = this.computeAutoAdvanceIndex(this.currentIndex);
    if (
      Number.isFinite(duration) &&
      duration > FADE_SECONDS &&
      time >= duration - FADE_SECONDS &&
      autoAdvance !== undefined
    ) {
      if (autoAdvance === this.currentIndex) this.restartInPlace(channel);
      else await this.skipToNextItem();
      return;
    }
    channel.audio.currentTime = time;
    channel.cutIn();
    this.hasTriggeredFadeForCurrent = false;
    if (channel === this.displayChannel) this.currentPlaybackTimeStore.set(time);
  }

  async setShuffle(shuffle: boolean) {
    if (shuffle === this.isShuffled) return;
    this.isShuffled = shuffle;
    const displayed = this.displayedIndex();
    if (shuffle) {
      this.buildPlayOrder(
        this.currentIndex === displayed ? [displayed] : [displayed, this.currentIndex],
      );
    }
    this.shuffleModeStore.set(shuffle);
    this.syncQueuePosition(displayed);
    this.prepareNextChannel();
  }

  private buildPlayOrder(pinned: readonly number[]) {
    const rest = this.items.map((_, index) => index).filter((index) => !pinned.includes(index));
    this.playOrder = [...pinned, ...shuffled(rest)];
  }

  async setRepeatMode(mode: RepeatMode) {
    if (mode === this.currentRepeatMode) return;
    this.currentRepeatMode = mode;
    this.repeatModeStore.set(mode);
    this.prepareNextChannel();
  }

  async setVolume(volume: number) {
    const clamped = Math.min(1, Math.max(0, volume));
    this.volumeGainNode.gain.setTargetAtTime(clamped, this.context.currentTime, 0.01);
    this.volumeStore.set(clamped);
  }

  destroy() {
    this.destroyActiveChannels();
    this.destroyFadingChannels();
    this.volumeGainNode.disconnect();
  }
}
