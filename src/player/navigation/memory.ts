import type {
  MenuItemIdentity,
  PlaybackQueueState,
  ScreenDefinition,
  ScreenRef,
  TrackIdentity,
} from "./menu.ts";

export interface RememberedSelection {
  itemId: string | undefined;
  index: number;
}

export interface ScrollMemory {
  syncQueue(playback: PlaybackQueueState, stack: readonly ScreenRef[]): boolean;
  remember(screen: ScreenRef, items: readonly MenuItemIdentity[], index: number): void;
  rememberedIndexIn(screen: ScreenRef, items: readonly MenuItemIdentity[]): number;
  setQueueSource(screen: ScreenRef): void;
  clearQueueSource(): void;
}

export function createScrollMemory(screenByKey: (key: string) => ScreenDefinition): ScrollMemory {
  const memory = new Map<string, RememberedSelection>();
  let queueSource: string | undefined;
  let lastQueue: readonly TrackIdentity[] | undefined;
  let lastIndex: number | undefined;

  function keyOf({ key, contextId }: ScreenRef): string {
    return `${key}:${contextId ?? ""}`;
  }

  function syncQueue(
    { queue, currentTrackIndex }: PlaybackQueueState,
    stack: readonly ScreenRef[],
  ): boolean {
    if (queue === lastQueue && currentTrackIndex === lastIndex) return false;
    lastQueue = queue;
    lastIndex = currentTrackIndex;
    const track = queue[currentTrackIndex];
    if (queueSource && track && !stack.some((screen) => keyOf(screen) === queueSource)) {
      memory.set(queueSource, { itemId: track.id, index: currentTrackIndex });
    }
    return true;
  }

  function remember(screen: ScreenRef, items: readonly MenuItemIdentity[], index: number) {
    const item = items[index];
    if (!item || screenByKey(screen.key).forgetsSelection) return;
    memory.set(keyOf(screen), { itemId: item.id, index });
  }

  function rememberedIndexIn(screen: ScreenRef, items: readonly MenuItemIdentity[]): number {
    const remembered = memory.get(keyOf(screen));
    if (!remembered) return -1;
    if (items[remembered.index]?.id === remembered.itemId) return remembered.index;
    return items.findIndex((item) => item.id === remembered.itemId);
  }

  function setQueueSource(screen: ScreenRef) {
    queueSource = keyOf(screen);
  }

  function clearQueueSource() {
    if (queueSource) {
      memory.delete(queueSource);
      queueSource = undefined;
    }
  }

  return { syncQueue, remember, rememberedIndexIn, setQueueSource, clearQueueSource };
}
