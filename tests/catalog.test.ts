import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { createCatalogStore } from "../src/player/catalog/store.ts";
import type { CatalogData, CatalogState, CatalogStore, Song } from "../src/player/catalog/types.ts";
import { getStore } from "../src/player/shared/store.ts";

type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

interface PendingFetch {
  signal: AbortSignal;
  resolve: (response: Response) => void;
}

const catalog: CatalogData = {
  songs: [
    { id: "one", name: "Example", previewUrl: "./audio/one.wav" },
    { id: "two", name: "Root URL", previewUrl: "/audio/two.wav" },
  ],
  artists: [{ id: "artist", name: "Artist", songIds: ["one"] }],
  playlists: [{ id: "playlist", name: "Playlist", songIds: ["one", "two"] }],
};

async function serve(t: TestContext, handler: RequestHandler): Promise<string> {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The catalog test server never reported a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

function catalogState(store: CatalogStore): CatalogState {
  return getStore(store.catalog);
}

function readyCatalog(store: CatalogStore): CatalogData {
  const state = catalogState(store);
  if (state.status !== "ready") {
    throw new Error(state.status === "error" ? String(state.error) : `status: ${state.status}`);
  }
  return state.data;
}

function catalogError(store: CatalogStore): Error {
  const state = catalogState(store);
  if (state.status !== "error") {
    throw new Error(`expected an errored catalog, received ${state.status}`);
  }
  return state.error instanceof Error ? state.error : new Error(String(state.error));
}

function serveWindow(t: TestContext, base: string): void {
  const globals = globalThis as { window?: { location: { href: string } } };
  globals.window = { location: { href: `${base}/` } };
  t.after(() => Reflect.deleteProperty(globalThis, "window"));
}

test("loads JSON over HTTP and resolves audio URLs against the final redirect URL", async (t) => {
  const requests: string[] = [];
  const base = await serve(t, (request, response) => {
    requests.push(request.url ?? "");
    if (request.url === "/catalog.json") {
      response.writeHead(302, { location: "/v2/catalog/catalog.json" }).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(catalog));
  });
  serveWindow(t, base);
  const store = createCatalogStore();
  t.after(store.destroy);

  await store.loadCatalog(`${base}/catalog.json`);

  const state = catalogState(store);
  assert.equal(state.status, "ready", state.status === "error" ? String(state.error) : undefined);
  assert.deepEqual(requests, ["/catalog.json", "/v2/catalog/catalog.json"]);
  const data = readyCatalog(store);
  assert.equal(data.songs[0].previewUrl, `${base}/v2/catalog/audio/one.wav`);
  assert.equal(data.songs[1].previewUrl, `${base}/audio/two.wav`);
  assert.equal(data.playlists[0].songIds.length, 2);
  await store.loadCatalog(`${base}/catalog.json`);
  assert.equal(requests.length, 2, "a loaded URL is not fetched a second time");
});

test("records HTTP failures and retries the same URL successfully", async (t) => {
  let attempts = 0;
  const base = await serve(t, (_request, response) => {
    attempts += 1;
    if (attempts === 1) {
      response.writeHead(503, { "content-type": "text/plain" }).end("maintenance");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(catalog));
  });
  serveWindow(t, base);
  const store = createCatalogStore();
  t.after(store.destroy);

  await store.loadCatalog(`${base}/catalog.json`);
  assert.equal(catalogState(store).status, "error");
  assert.match(catalogError(store).message, /503/);

  await store.loadCatalog(`${base}/catalog.json`);
  assert.equal(catalogState(store).status, "ready");
  assert.equal(attempts, 2);
});

test("new requests and destruction prevent late responses from publishing stale data", async (t) => {
  const requests: PendingFetch[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    (_url: RequestInfo | URL, init: { signal: AbortSignal }) =>
      new Promise<Response>((resolve) => {
        requests.push({ signal: init.signal, resolve });
      }),
  );
  const base = "https://catalog.example";
  serveWindow(t, base);
  const store = createCatalogStore();
  t.after(store.destroy);

  const slow = store.loadCatalog(`${base}/slow.json`);
  const fast = store.loadCatalog(`${base}/fast.json`);
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve(new Response(JSON.stringify({ ...catalog, songs: [{ id: "new" }] })));
  await fast;
  requests[0].resolve(new Response(JSON.stringify(catalog)));
  await slow;
  const songs: readonly Song[] = readyCatalog(store).songs;
  assert.equal(songs[0].id, "new");

  const pending = store.loadCatalog(`${base}/destroy.json`);
  store.destroy();
  assert.equal(requests[2].signal.aborted, true);
  const stateAtDestroy = catalogState(store);
  requests[2].resolve(new Response(JSON.stringify(catalog)));
  await pending;
  assert.equal(catalogState(store), stateAtDestroy);
  await store.loadCatalog(`${base}/after-destroy.json`);
  assert.equal(requests.length, 3, "destroyed stores cannot start new requests");
});
