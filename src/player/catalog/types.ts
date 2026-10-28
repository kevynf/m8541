export interface Song {
  id: string;
  name: string;
  artistName?: string;
  albumName?: string;
  previewUrl?: string;
}

export interface SongCollection {
  id: string;
  name: string;
  songIds: readonly string[];
}

export type Artist = SongCollection;
export type Playlist = SongCollection;

export interface CatalogData {
  songs: Song[];
  artists: Artist[];
  playlists: Playlist[];
}

export type CatalogPayload = CatalogData;

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; data: CatalogData }
  | { status: "error"; error: unknown };

export type TrackKind = "songs" | "playlist-tracks" | "artist-tracks";

export type Store<T> = {
  subscribe(run: (value: T) => void): () => void;
  set(next: T): void;
  update(updater: (value: T) => T): void;
  get(): T;
};

export interface CatalogStore {
  readonly catalog: Store<CatalogState>;
  loadCatalog(url: string): Promise<void>;
  destroy(): void;
}
