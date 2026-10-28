import type { CatalogData, Song, SongCollection, TrackKind } from "./types.ts";

const songMaps = new WeakMap<CatalogData, Map<string, Song>>();

export function songsByIds(ids: readonly string[], data: CatalogData): Song[] {
  let map = songMaps.get(data);
  if (!map) {
    map = new Map(data.songs.map((song) => [song.id, song]));
    songMaps.set(data, map);
  }
  return ids.map((id) => map.get(id)).filter((song): song is Song => song !== undefined);
}

function fromContainer(
  container: readonly SongCollection[],
  contextId: string | undefined,
  data: CatalogData,
): Song[] {
  return songsByIds(container.find((entry) => entry.id === contextId)?.songIds ?? [], data);
}

export function tracksOf(
  kind: TrackKind,
  contextId: string | undefined,
  data: CatalogData,
): Song[] {
  switch (kind) {
    case "songs":
      return [...data.songs];
    case "playlist-tracks":
      return fromContainer(data.playlists, contextId, data);
    case "artist-tracks":
      return fromContainer(data.artists, contextId, data);
    default:
      return [];
  }
}
