import { createStore } from "../shared/store.ts";
import type { CatalogPayload, CatalogState, CatalogStore, Store } from "./types.ts";

export function createCatalogStore(): CatalogStore {
  const catalog: Store<CatalogState> = createStore({ status: "loading" });
  let controller: AbortController | undefined;
  let loadedUrl: string | undefined;
  let destroyed = false;

  async function loadCatalog(url: string): Promise<void> {
    if (destroyed || !url || url === loadedUrl) return;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    loadedUrl = url;
    catalog.set({ status: "loading" });
    try {
      const catalogUrl = new URL(url, window.location.href);
      const response = await fetch(catalogUrl, { signal: request.signal });
      if (!response.ok) {
        throw new Error(`Failed to load the catalog: ${response.status} ${response.statusText}`);
      }
      const { songs, artists, playlists } = (await response.json()) as CatalogPayload;
      const base = response.url || catalogUrl.href;
      const data = {
        songs: songs.map((song) => ({
          ...song,
          previewUrl: song.previewUrl ? new URL(song.previewUrl, base).href : undefined,
        })),
        artists,
        playlists,
      };
      if (!request.signal.aborted) catalog.set({ status: "ready", data });
    } catch (error) {
      if (!request.signal.aborted) {
        loadedUrl = undefined;
        catalog.set({ status: "error", error });
      }
    }
  }

  function destroy(): void {
    destroyed = true;
    controller?.abort();
  }

  return { catalog, loadCatalog, destroy };
}
