import { createStore } from "../shared/store.ts";
import type { Store } from "../shared/store.ts";

export const isOnline: Store<boolean> = createStore(true, (set) => {
  const update = () => set(navigator.onLine);
  update();
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
});
