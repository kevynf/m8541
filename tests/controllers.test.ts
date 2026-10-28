import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import {
  createSeekController,
  createVolumeController,
} from "../src/player/playback/controllers.ts";
import type { PlaybackState, PlaybackStore } from "../src/player/playback/store.ts";
import type { Store } from "../src/player/shared/store.ts";
import { createStore, getStore } from "../src/player/shared/store.ts";

type PlaybackCall = ["seek", number] | ["volume", number];

type PlaybackFixtureState = Pick<
  PlaybackState,
  | "currentTrackIndex"
  | "currentPlaybackTime"
  | "currentPlaybackDuration"
  | "queue"
  | "hasLoadedItem"
  | "volume"
>;

interface PlaybackFixture {
  state: Store<PlaybackFixtureState>;
  calls: PlaybackCall[];
  subscribe: Store<PlaybackFixtureState>["subscribe"];
  seek: PlaybackStore["seek"];
  setVolume: PlaybackStore["setVolume"];
}

function clock(t: TestContext): (ms: number) => void {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  return (ms) => t.mock.timers.tick(ms);
}

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function createPlayback(): PlaybackFixture {
  const state: Store<PlaybackFixtureState> = createStore({
    currentTrackIndex: 0,
    currentPlaybackTime: 4,
    currentPlaybackDuration: 20,
    queue: [{ id: "one" }],
    hasLoadedItem: true,
    volume: 0.5,
  });
  const calls: PlaybackCall[] = [];
  return {
    state,
    calls,
    subscribe: state.subscribe,
    seek: async (time) => {
      calls.push(["seek", time]);
    },
    setVolume: async (volume) => {
      calls.push(["volume", volume]);
      state.update((s) => ({ ...s, volume }));
    },
  };
}

test("seek clamps previews, commits after release, and cancels pending seeks on track changes", async (t) => {
  const advance = clock(t);
  const playback = createPlayback();
  const seek = createSeekController(playback as unknown as PlaybackStore);
  t.after(seek.destroy);

  seek.toggle();
  seek.seekTo(-10);
  assert.equal(seek.peek().seekPreviewTime, 0);
  advance(750);
  seek.seekTo(99);
  assert.equal(seek.peek().seekPreviewTime, 20);
  advance(750);
  assert.deepEqual(playback.calls, []);
  advance(250);
  await flush();
  assert.deepEqual(playback.calls, [["seek", 20]]);
  assert.equal(seek.peek().seekPreviewTime, undefined);

  seek.handleDragStart();
  seek.seekTo(10);
  advance(1500);
  assert.deepEqual(playback.calls, [["seek", 20]], "dragging only changes the preview");
  seek.handleDragEnd();
  advance(1000);
  await flush();
  assert.deepEqual(playback.calls, [
    ["seek", 20],
    ["seek", 10],
  ]);

  assert.equal(seek.seekTo(12), true, "a seek must actually be pending before changing tracks");
  playback.state.update((s) => ({
    ...s,
    currentTrackIndex: 1,
    queue: [...s.queue, { id: "two" }],
  }));
  assert.equal(seek.peek().isSeeking, false, "changing tracks exits the stale seek session");
  advance(1500);
  assert.deepEqual(playback.calls, [
    ["seek", 20],
    ["seek", 10],
  ]);
  assert.equal(seek.peek().seekPreviewTime, undefined);
});

test("volume clamps, stays open while focused, and exits after release or navigation", (t) => {
  const advance = clock(t);
  const playback = createPlayback();
  const volume = createVolumeController(playback as unknown as PlaybackStore);
  t.after(volume.destroy);

  volume.set(200);
  assert.equal(getStore(playback.state).volume, 1);
  assert.equal(volume.peek().isAdjustingVolume, true);
  volume.set(-10);
  assert.equal(getStore(playback.state).volume, 0);
  volume.keepOpen();
  advance(6000);
  assert.equal(volume.peek().isAdjustingVolume, true);
  volume.release();
  advance(5000);
  assert.equal(volume.peek().isAdjustingVolume, false);

  volume.set(50);
  volume.handleScreenChange(false);
  assert.equal(volume.peek().isAdjustingVolume, false);
  assert.equal(getStore(playback.state).volume, 0.5);
});
