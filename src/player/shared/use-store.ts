import { useSyncExternalStore } from "react";
import type { ReadableStore } from "./store.ts";

export function useStore<T>(store: ReadableStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
