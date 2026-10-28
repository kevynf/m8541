import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogData, Song } from "../src/player/catalog/types.ts";
import type { I18n } from "../src/player/i18n.ts";
import { createScrollMemory } from "../src/player/navigation/memory.ts";
import type { MenuItem, ScreenRef } from "../src/player/navigation/menu.ts";
import { itemsFor, queueFor, queueIndexFor } from "../src/player/navigation/menu.ts";

function menuItems(songs: readonly Song[]): MenuItem[] {
  return songs.map(
    (song): MenuItem => ({
      id: song.id,
      title: song.name,
      action: "play",
      songId: song.id,
    }),
  );
}

test("restores by song identity after reordering and keeps playlists independent", () => {
  const memory = createScrollMemory(() => ({ view: "list", forgetsSelection: false }));
  const first: ScreenRef = { key: "playlist-tracks", contextId: "first" };
  const second: ScreenRef = { key: "playlist-tracks", contextId: "second" };
  const songs: Song[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  const items = menuItems(songs);
  memory.remember(first, items, 1);
  memory.remember(second, items, 2);
  assert.equal(memory.rememberedIndexIn(first, [items[1], items[0]]), 0);
  assert.equal(memory.rememberedIndexIn(second, items), 2);
  assert.equal(memory.rememberedIndexIn(first, [items[2]]), -1);
});

test("queue advances update the source selection only when that list is outside the stack", () => {
  const memory = createScrollMemory(() => ({ view: "list", forgetsSelection: false }));
  const screen: ScreenRef = { key: "songs" };
  const queue: Song[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  const items = menuItems(queue);
  memory.remember(screen, items, 0);
  memory.setQueueSource(screen);
  memory.syncQueue({ queue, currentTrackIndex: 1 }, [screen]);
  assert.equal(memory.rememberedIndexIn(screen, items), 0);
  memory.syncQueue({ queue, currentTrackIndex: 0 }, [{ key: "main" }]);
  memory.syncQueue({ queue, currentTrackIndex: 1 }, [{ key: "main" }]);
  assert.equal(memory.rememberedIndexIn(screen, items), 1);
  memory.clearQueueSource();
  assert.equal(memory.rememberedIndexIn(screen, items), -1);
});

test("playlist and artist menus resolve song IDs into playable queue tracks", () => {
  const data: CatalogData = {
    songs: [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
      { id: "c", name: "C" },
    ],
    artists: [{ id: "artist", name: "Artist", songIds: ["c", "a", "missing"] }],
    playlists: [{ id: "playlist", name: "Mix", songIds: ["b", "a", "b"] }],
  };
  const i18n: I18n = {
    t: (key) => key,
    formatNumber: (value) => String(value),
    formatList: (values) => values.join(", "),
  };
  const playlist: ScreenRef = { key: "playlist-tracks", contextId: "playlist" };
  const artist: ScreenRef = { key: "artist-tracks", contextId: "artist" };
  const playlistItems = itemsFor(playlist, { data, hasNowPlaying: false, i18n });
  const artistItems = itemsFor(artist, { data, hasNowPlaying: false, i18n });

  const queue = queueFor(playlistItems, data);
  assert.deepEqual(
    queue.map(({ id }) => id),
    ["b", "a", "b"],
  );
  assert.equal(
    queueIndexFor(playlistItems, { queue, currentTrackIndex: 2 }),
    2,
    "duplicate songs preserve the selected queue position",
  );
  assert.equal(
    queueIndexFor(playlistItems, {
      queue: [data.songs[0], data.songs[1]],
      currentTrackIndex: 1,
    }),
    -1,
    "a different queue must not masquerade as the list selection",
  );
  assert.deepEqual(
    queueFor(artistItems, data).map(({ id }) => id),
    ["c", "a"],
  );
  const allSongs = itemsFor({ key: "songs" }, { data, i18n });
  assert.deepEqual(
    queueFor(allSongs, data).map(({ id }) => id),
    ["a", "b", "c"],
  );
});
