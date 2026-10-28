import assert from "node:assert/strict";
import { test } from "node:test";
import { installFakeAudio } from "./helpers/fake-audio.ts";
import type { HostPlayback } from "../src/player/playback/host-player.ts";
import type { PlaybackTrack } from "../src/player/playback/store.ts";
import { createPlaybackStore } from "../src/player/playback/store.ts";
import { createStore, getStore } from "../src/player/shared/store.ts";

interface PlaybackHost extends HostPlayback {
  queue: readonly string[];
}

const flushPromises = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function createHost(): PlaybackHost {
  const host: PlaybackHost = {
    queue: [],
    isPlaying: createStore(false),
    currentPlaybackTime: createStore(0),
    currentPlaybackDuration: createStore(60),
    currentItemIndex: createStore(0),
    hasLoadedItem: createStore(false),
    shuffleMode: createStore(false),
    repeatMode: createStore("none"),
    volume: createStore(1),
    async setQueue(trackIds) {
      host.queue = trackIds;
    },
    async resume() {
      host.isPlaying.set(true);
    },
    async pause() {
      host.isPlaying.set(false);
    },
    async seekToTime(time) {
      host.currentPlaybackTime.set(time);
    },
    async changeToQueueItem(_trackId, index) {
      host.currentItemIndex.set(index);
      host.hasLoadedItem.set(true);
    },
    async skipToNextItem() {
      host.currentItemIndex.update((index) => index + 1);
    },
    async skipToPreviousItem() {
      host.currentItemIndex.update((index) => index - 1);
    },
    async setShuffle(value) {
      host.shuffleMode.set(value);
    },
    async setRepeatMode(mode) {
      host.repeatMode.set(mode);
    },
    async setVolume(value) {
      host.volume.set(value);
    },
    async clearQueue() {
      host.queue = [];
    },
  };
  return host;
}

test("host playback mirrors state, forwards controls, and unsubscribes on destroy", async (t) => {
  const host = createHost();
  const playback = createPlaybackStore();
  t.after(() => playback.destroy());
  const songs: PlaybackTrack[] = [
    { id: "a", previewUrl: "/a.wav" },
    { id: "b", previewUrl: "/b.wav" },
  ];

  playback.setPlayback(host);
  await playback.setShuffle(true);
  await playback.setRepeatMode("all");
  await playback.setVolume(0.4);
  await playback.play(songs, 1);

  assert.deepEqual(host.queue, ["a", "b"]);
  assert.equal(getStore(playback).currentTrackIndex, 1);
  assert.equal(getStore(playback).isPlaying, true);
  assert.equal(getStore(playback).shuffleMode, true);
  assert.equal(getStore(playback).repeatMode, "all");
  assert.equal(getStore(playback).volume, 0.4);

  host.currentPlaybackTime.set(12);
  host.currentPlaybackDuration.set(40);
  host.currentItemIndex.set(0);
  assert.equal(getStore(playback).currentPlaybackTime, 12);
  assert.equal(getStore(playback).currentPlaybackDuration, 40);
  assert.equal(getStore(playback).currentTrackIndex, 0);

  await playback.seek(18);
  await playback.skipNext();
  await playback.pause();
  assert.equal(getStore(playback).currentPlaybackTime, 18);
  assert.equal(getStore(playback).currentTrackIndex, 1);
  assert.equal(getStore(playback).isPlaying, false);

  playback.destroy();
  host.currentPlaybackTime.set(30);
  assert.equal(getStore(playback).currentPlaybackTime, 18);
});

test("an aborted queue start cannot overwrite a newer playback request", async (t) => {
  let releaseFirstQueue!: () => void;
  let firstQueueStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstQueueStarted = resolve;
  });
  const host = createHost();
  const originalSetQueue = host.setQueue;
  let queueCall = 0;
  host.setQueue = async (trackIds) => {
    queueCall += 1;
    await originalSetQueue(trackIds);
    if (queueCall === 1) {
      firstQueueStarted();
      await new Promise<void>((resolve) => {
        releaseFirstQueue = resolve;
      });
    }
  };
  const playback = createPlaybackStore();
  t.after(() => playback.destroy());
  playback.setPlayback(host);

  const staleStart = playback.play([{ id: "old" }]);
  await started;
  const currentStart = playback.play([{ id: "new" }]);
  releaseFirstQueue();
  await Promise.all([staleStart, currentStart]);

  assert.deepEqual(host.queue, ["new"]);
  assert.deepEqual(
    getStore(playback).queue.map(({ id }) => id),
    ["new"],
  );
  assert.equal(getStore(playback).isPlaying, true);
});

test("built-in playback pauses, seeks, advances automatically, repeats, and finishes its queue", async (t) => {
  const { FakeAudioContext, audios } = installFakeAudio(t);
  const playback = createPlaybackStore(new FakeAudioContext());
  t.after(playback.destroy);
  let finished = 0;
  playback.onQueueFinished(() => {
    finished += 1;
  });

  await playback.play(["a", "b"].map((id): PlaybackTrack => ({ id, previewUrl: `/${id}.wav` })));
  const first = audios.find((audio) => audio.src === "/a.wav" && !audio.paused);
  assert.ok(first, "the selected track starts playing");
  first.tick(1);
  assert.equal(getStore(playback).currentPlaybackTime, 1);
  assert.equal(getStore(playback).currentPlaybackDuration, first.duration);

  await playback.pause();
  assert.equal(first.paused, true);
  assert.equal(getStore(playback).isPlaying, false);
  await playback.seek(2.5);
  assert.equal(first.currentTime, 2.5);
  assert.equal(getStore(playback).currentPlaybackTime, 2.5);
  await playback.resume();
  assert.equal(first.paused, false);
  assert.equal(getStore(playback).isPlaying, true);

  first.tick(first.duration - 1);
  const second = audios.find((audio) => audio.src === "/b.wav" && !audio.paused);
  assert.ok(second, "the next track starts without a skip command");
  second.tick(1);
  assert.equal(getStore(playback).currentTrackIndex, 1);

  await playback.setRepeatMode("one");
  await playback.seek(2);
  await playback.skipNext();
  assert.equal(getStore(playback).currentTrackIndex, 1);
  assert.equal(getStore(playback).currentPlaybackTime, 0);
  assert.equal(second.currentTime, 0);

  await playback.setRepeatMode("all");
  await playback.skipNext();
  assert.equal(getStore(playback).currentTrackIndex, 0, "repeat-all wraps to the first track");
  await playback.setRepeatMode("none");
  await playback.skipNext();
  assert.equal(getStore(playback).currentTrackIndex, 1);
  audios.find((audio) => audio.src === "/b.wav" && !audio.paused)?.finish();
  await flushPromises();
  assert.equal(getStore(playback).isPlaying, false);
  assert.equal(getStore(playback).hasLoadedItem, false);
  assert.deepEqual(getStore(playback).queue, []);
  assert.equal(finished, 1);
  assert.ok(audios.every((audio) => audio.paused && audio.src === ""));
});
