import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, Ref } from "react";
import MenuTitle from "./MenuTitle.tsx";
import MenuList from "./MenuList.tsx";
import AnimatedScreen from "./AnimatedScreen.tsx";
import NowPlaying from "../playback/NowPlaying.tsx";
import BrickGame from "../brick/BrickGame.tsx";
import type { BrickGameHandle } from "../brick/BrickGame.tsx";
import { settings, setBacklight, resetSettings } from "../settings/store.ts";
import type { Settings } from "../settings/types.ts";
import { createI18n } from "../i18n.ts";
import type { I18n } from "../i18n.ts";
import { createLogger } from "../shared/logger.ts";
import { useStore } from "../shared/use-store.ts";
import { screenKeys } from "./keyboard.ts";
import {
  createSeekController,
  createVolumeController,
  VOLUME_HOLD_STEP,
} from "../playback/controllers.ts";
import type {
  SeekController,
  SeekState,
  VolumeController,
  VolumeState,
} from "../playback/controllers.ts";
import { createScrollMemory } from "./memory.ts";
import { createAccelerator, tierAt, arrowSpeed, SCROLL_CURVE } from "../wheel/acceleration.ts";
import { debounce } from "../shared/timers.ts";
import { toPercent } from "../shared/math.ts";
import { tracksOf } from "../catalog/queries.ts";
import type { CatalogData, TrackKind } from "../catalog/types.ts";
import type { PlaybackStore, PlaybackState } from "../playback/store.ts";
import type { ScrubValue } from "../playback/NowPlaying.tsx";
import {
  screenByKey,
  itemsFor,
  listsNowPlaying,
  titleFor,
  stackTop,
  nowPlayingScreen,
  isPlayableTarget,
  playableItems,
  queueFor,
  queueIndexFor,
} from "./menu.ts";
import type { MenuItem, PlaybackQueueState, ScreenRef } from "./menu.ts";
import type { ReadableStore } from "../shared/store.ts";
import type { ScrollTarget } from "../wheel/scrolling.ts";

const logger = createLogger("<Screen>");
const IDLE_JUMP_MS = 10000;
const PADDLE_STEP = 360;

function readonlyStore<T>(value: T): ReadableStore<T> {
  return {
    subscribe(run) {
      run(value);
      return () => {};
    },
    get() {
      return value;
    },
  };
}

const EMPTY_SEEK_STORE = readonlyStore<SeekState>({ isSeeking: false, seekPreviewTime: undefined });
const EMPTY_VOLUME_STORE = readonlyStore<VolumeState>({ isAdjustingVolume: false });

type ViewKeyMode = "list" | "now-playing" | "passthrough";

type StackEntry = ScreenRef & {
  selectedItemId?: string;
  selectedIndexAtPush?: number;
  scrollTopAtPush?: number;
  suppressNowPlayingSyncAtPush?: boolean;
};

export interface ScreenApi {
  back: () => void;
  select: () => void;
  selectHold: () => void;
  play: () => void;
  moveBy: (direction: number, step?: number) => boolean | undefined;
  keyStep: (direction: number, heldMs: number) => boolean | undefined;
  accelerate: (magnitude: number, direction: number) => number;
  currentScrollTarget: () => ScrollTarget;
  turnPaddle: (degrees: number) => void;
  steerPaddle: (step: number | null) => void;
  notifyActivity: () => void;
  readonly seekController?: SeekController;
  readonly volumeController?: VolumeController;
}

export interface ScreenStateChange {
  scrollTarget: ScrollTarget;
  selectHoldMs: number | null;
  screenApi: ScreenApi;
}

interface ScreenActions {
  currentItems?: MenuItem[];
  back?: () => void;
  select?: () => void;
  selectHold?: () => void;
  play?: () => void;
  moveBy?: (direction: number, step?: number) => boolean | undefined;
  keyStep?: (direction: number, heldMs: number) => boolean | undefined;
  accelerate?: (magnitude: number, direction: number) => number;
  currentScrollTarget?: () => ScrollTarget;
  turnPaddle?: (degrees: number) => void;
  steerPaddle?: (step: number | null) => void;
  pushIdle?: () => void;
  notifyActivity?: () => void;
}

interface ScreenProps {
  data?: CatalogData;
  playback: PlaybackStore;
  navigateToUrl?: (url: string) => void | Promise<void>;
  disabled?: boolean;
  onMenuHold?: () => void;
  onStateChange?: (state: ScreenStateChange) => void;
  i18n?: I18n;
  ref?: Ref<ScreenApi>;
}

const VIEW_SCROLL_TARGETS: Record<string, ScrollTarget> = {
  list: "list",
  "now-playing": "volume",
  brick: "brick",
};
const VIEW_KEY_MODES: Record<string, ViewKeyMode> = {
  list: "list",
  "now-playing": "now-playing",
  brick: "passthrough",
};

function deepActiveElement(): Element | null {
  if (typeof document === "undefined") return null;
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

export default function Screen({
  data,
  playback,
  navigateToUrl,
  disabled = false,
  onMenuHold,
  onStateChange,
  i18n,
  ref,
}: ScreenProps) {
  const playbackState = useStore(playback) as PlaybackState & PlaybackQueueState;
  const settingsState = useStore(settings);
  const fallbackI18n = useRef<I18n | null>(null);
  const currentI18n = i18n ?? fallbackI18n.current ?? createI18n();
  fallbackI18n.current = currentI18n;

  const controllers = useMemo(
    () =>
      playback
        ? {
            seek: createSeekController(playback),
            volume: createVolumeController(playback),
          }
        : null,
    [playback],
  );
  const seekController = controllers?.seek;
  const volumeController = controllers?.volume;
  const seekState = useStore(seekController ?? EMPTY_SEEK_STORE);
  const volumeState = useStore(volumeController ?? EMPTY_VOLUME_STORE);

  const [screenStack, setScreenStack] = useState<StackEntry[]>([{ key: "main" }]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [navigationId, setNavigationId] = useState(0);
  const [isNavigatingBack, setIsNavigatingBack] = useState(false);
  const [restoredScrollTop, setRestoredScrollTop] = useState<number | undefined>(undefined);
  const [shouldFocusNextScreen, setShouldFocusNextScreen] = useState(false);
  const [suppressNowPlayingSync, setSuppressNowPlayingSync] = useState(false);
  const [brickScore, setBrickScore] = useState(0);
  const [brickBalls, setBrickBalls] = useState(0);
  const [lastArrowAt, setLastArrowAt] = useState<number | undefined>(undefined);

  const menuEl = useRef<HTMLDivElement>(null);
  const brickGameEl = useRef<BrickGameHandle | null>(null);
  const listScrollEl = useRef<HTMLUListElement | null>(null);
  const navigationIdRef = useRef(0);
  const screenStackRef = useRef(screenStack);
  const selectedIndexRef = useRef(selectedIndex);
  const suppressSyncRef = useRef(suppressNowPlayingSync);
  const lastArrowAtRef = useRef(lastArrowAt);
  const actionRefs = useRef<Partial<ScreenActions>>({});
  const transitionSnapshotRef = useRef("");
  const keyboardAction = useRef<ReturnType<typeof screenKeys> | null>(null);
  const wheelAccel = useMemo(() => createAccelerator(SCROLL_CURVE), []);
  const scrollMemory = useMemo(() => createScrollMemory(screenByKey), []);

  const currentScreen = stackTop(screenStack);
  const currentDefinition = screenByKey(currentScreen.key);
  const view = currentDefinition.view;
  const hasNowPlaying = (playbackState?.queue?.length ?? 0) > 0;
  const currentItems = useMemo(
    () =>
      itemsFor(currentScreen, {
        data,
        hasNowPlaying: listsNowPlaying(currentScreen.key, hasNowPlaying),
        i18n: currentI18n,
      }),
    [currentI18n, currentScreen, data, hasNowPlaying],
  );
  const currentScrollTarget = seekState?.isSeeking ? "seek" : VIEW_SCROLL_TARGETS[view];
  const selectHoldMs = currentDefinition.selectHold?.ms ?? null;
  const title = titleFor(currentScreen, data, currentI18n);
  const nowPlayingTrack =
    view === "now-playing" ? playbackState?.queue?.[playbackState.currentTrackIndex] : undefined;

  screenStackRef.current = screenStack;
  selectedIndexRef.current = selectedIndex;
  navigationIdRef.current = navigationId;
  suppressSyncRef.current = suppressNowPlayingSync;
  lastArrowAtRef.current = lastArrowAt;

  function setSelectedIndexNow(next: number) {
    selectedIndexRef.current = next;
    setSelectedIndex(next);
  }

  function isFocusOutside() {
    const active = deepActiveElement();
    return !!active && active !== document.body && !menuEl.current?.contains(active);
  }

  function itemsForScreen(screen: ScreenRef) {
    return itemsFor(screen, {
      data,
      hasNowPlaying: listsNowPlaying(screen.key, (playbackState?.queue?.length ?? 0) > 0),
      i18n: currentI18n,
    });
  }

  function resolveScrollTarget(seeking: boolean, screenKey: string): ScrollTarget {
    return seeking ? "seek" : VIEW_SCROLL_TARGETS[screenByKey(screenKey).view];
  }

  function currentScrollTargetFn(): ScrollTarget {
    return resolveScrollTarget(
      seekController?.peek().isSeeking ?? false,
      stackTop(screenStackRef.current).key,
    );
  }

  function initialIndex(screen: ScreenRef) {
    const items = itemsForScreen(screen);
    if (items[0]?.action !== "toggle") {
      const queueIndex = queueIndexFor(items, playbackState);
      return queueIndex >= 0
        ? queueIndex
        : Math.max(0, scrollMemory.rememberedIndexIn(screen, items));
    }
    const index = items.findIndex(
      (item) =>
        item.action === "toggle" && item.target === settingsState?.[screen.key as keyof Settings],
    );
    return index >= 0 ? index : 0;
  }

  function handleScreenChange(screenKey: string) {
    const isNowPlaying = screenByKey(screenKey).view === "now-playing";
    seekController?.handleScreenChange(isNowPlaying);
    volumeController?.handleScreenChange(isNowPlaying);
  }

  function pushScreen(screen: StackEntry, idleJump = false) {
    const stack = screenStackRef.current;
    transitionSnapshotRef.current = menuEl.current?.querySelector(".screen")?.innerHTML ?? "";
    const previous = stackTop(stack);
    const oldItems = actionRefs.current.currentItems ?? currentItems;
    const oldIndex = selectedIndexRef.current;
    setShouldFocusNextScreen(
      idleJump ? !!menuEl.current?.contains(deepActiveElement()) : !isFocusOutside(),
    );
    setIsNavigatingBack(false);
    setNavigationId((value) => {
      navigationIdRef.current = value + 1;
      return value + 1;
    });
    setRestoredScrollTop(undefined);
    lastArrowAtRef.current = undefined;
    setLastArrowAt(undefined);
    scrollMemory.remember(previous, oldItems, oldIndex);
    const entry: StackEntry = {
      ...previous,
      selectedItemId: oldItems[oldIndex]?.id,
      selectedIndexAtPush: oldIndex,
      scrollTopAtPush: listScrollEl.current?.scrollTop,
      suppressNowPlayingSyncAtPush: idleJump && suppressSyncRef.current,
    };
    const nextStack = [...stack.slice(0, -1), entry, screen];
    screenStackRef.current = nextStack;
    setScreenStack(nextStack);
    setSelectedIndexNow(initialIndex(screen));
    setSuppressNowPlayingSync(false);
    suppressSyncRef.current = false;
    handleScreenChange(screen.key);
    wheelAccel.reset();
  }

  function popScreen() {
    const stack = screenStackRef.current;
    if (stack.length <= 1) return;
    transitionSnapshotRef.current = menuEl.current?.querySelector(".screen")?.innerHTML ?? "";
    const oldItems = actionRefs.current.currentItems ?? currentItems;
    const oldIndex = selectedIndexRef.current;
    setShouldFocusNextScreen(!isFocusOutside());
    setIsNavigatingBack(true);
    setNavigationId((value) => {
      navigationIdRef.current = value + 1;
      return value + 1;
    });
    lastArrowAtRef.current = undefined;
    setLastArrowAt(undefined);
    scrollMemory.remember(stackTop(stack), oldItems, oldIndex);
    const nextStack = stack.slice(0, -1);
    const entry: StackEntry = stackTop(nextStack);
    const nextSuppress = entry.suppressNowPlayingSyncAtPush ?? false;
    screenStackRef.current = nextStack;
    setScreenStack(nextStack);
    setSuppressNowPlayingSync(nextSuppress);
    suppressSyncRef.current = nextSuppress;
    handleScreenChange(entry.key);
    wheelAccel.reset();
    const items = itemsForScreen(entry);
    const queueIndex = queueIndexFor(items, playbackState);
    const { selectedIndexAtPush, scrollTopAtPush } = entry;
    const nextIndex =
      queueIndex >= 0 && !nextSuppress
        ? queueIndex
        : Math.max(0, scrollMemory.rememberedIndexIn(entry, items));
    setSelectedIndexNow(nextIndex);
    setRestoredScrollTop(nextIndex === selectedIndexAtPush ? scrollTopAtPush : undefined);
  }

  function moveSelection(delta: number) {
    const items = actionRefs.current.currentItems ?? currentItems;
    if (items.length === 0) return false;
    const next = Math.min(items.length - 1, Math.max(0, selectedIndexRef.current + delta));
    const changed = next !== selectedIndexRef.current;
    setSelectedIndexNow(next);
    if (changed) {
      setSuppressNowPlayingSync(true);
      suppressSyncRef.current = true;
    }
    return changed;
  }

  function wheelScroll(magnitude: number, direction: number) {
    const target = currentScrollTargetFn();
    const seekStep = seekController?.accelerate(magnitude, direction) ?? 0;
    const listStep = wheelAccel.next(magnitude, direction, target === "list");
    return target === "seek" ? seekStep : listStep;
  }

  function moveBy(direction: number, step = 1) {
    switch (currentScrollTargetFn()) {
      case "seek":
        return seekController?.seek(direction * step) ?? false;
      case "volume":
        return direction > 0 ? volumeController?.increase(step) : volumeController?.decrease(step);
      case "list":
        return moveSelection(direction * step);
      default:
        return false;
    }
  }

  function holdStep(direction: number, heldMs: number) {
    switch (currentScrollTargetFn()) {
      case "seek":
        return moveBy(direction, seekController?.accelerateHold(heldMs) ?? 0);
      case "volume":
        return moveBy(direction, VOLUME_HOLD_STEP);
      default:
        return moveBy(direction, tierAt(SCROLL_CURVE, heldMs));
    }
  }

  function select() {
    if (view === "brick") {
      brickGameEl.current?.launchBall();
      return;
    }
    if (view === "now-playing") {
      if (volumeController?.peek().isAdjustingVolume) {
        volumeController.exit();
        return;
      }
      if (!playbackState?.hasLoadedItem) return;
      seekController?.toggle();
      return;
    }
    const item = currentItems[selectedIndexRef.current];
    if (!item) return;
    switch (item.action) {
      case "navigate":
        pushScreen({
          key: item.target,
          contextId: item.contextId,
          titleKey: item.screenTitleKey,
        });
        break;
      case "inline-toggle": {
        const current = settingsState?.[item.toggleKey];
        const index = item.values.indexOf(current);
        const next = item.values[(index + 1) % item.values.length];
        settings.update((state) => ({ ...state, [item.toggleKey]: next }));
        break;
      }
      case "toggle":
        setBacklight(item.target);
        popScreen();
        break;
      case "cancel":
        popScreen();
        break;
      case "reset-all":
        resetSettings();
        popScreen();
        break;
      case "play": {
        if (!data) break;
        const index = playableItems(currentItems).indexOf(item);
        if (index < 0) {
          logger.warn("Selected song not found in queue:", item.songId);
          break;
        }
        if (queueIndexFor(currentItems, playbackState) === selectedIndexRef.current) {
          if (!playbackState?.isPlaying) playback.resume();
        } else {
          scrollMemory.setQueueSource(currentScreen);
          playback.play(queueFor(currentItems, data), index);
        }
        pushScreen(nowPlayingScreen());
        break;
      }
      case "info":
        break;
      default:
        logger.warn("Unhandled menu item action:", item);
    }
  }

  function maybeAutoPlay(item: MenuItem | undefined) {
    if (!item || item.action !== "navigate" || !isPlayableTarget(item.target) || !data)
      return false;
    const tracks = tracksOf(item.target as TrackKind, item.contextId, data);
    if (tracks.length === 0) return false;
    scrollMemory.setQueueSource({ key: item.target, contextId: item.contextId });
    playback.play(tracks);
    pushScreen(nowPlayingScreen());
    return true;
  }

  function play() {
    if (playbackState?.hasLoadedItem) {
      if (playbackState.isPlaying) playback.pause();
      else playback.resume();
      return;
    }
    if (playbackState?.isLoading) {
      playback.pause();
      return;
    }
    const item = currentItems[selectedIndexRef.current];
    if (!maybeAutoPlay(item)) {
      if (item?.action === "play") {
        select();
        return;
      }
      if ((playbackState?.queue?.length ?? 0) > 0) playback.resume();
    }
  }

  function handleArrowKey(event: KeyboardEvent, direction: number) {
    const speed = arrowSpeed(event.timeStamp, lastArrowAtRef.current);
    lastArrowAtRef.current = event.timeStamp;
    setLastArrowAt(event.timeStamp);
    moveBy(direction, wheelScroll(speed, direction));
  }

  function ensureScrubbing() {
    if (playbackState?.hasLoadedItem) {
      volumeController?.exit();
      seekController?.keepOpen();
    }
  }

  function handleVolumeFocus() {
    seekController?.exit();
    volumeController?.keepOpen();
  }

  function handleScrub(value: ScrubValue) {
    ensureScrubbing();
    seekController?.seekTo(value?.detail ?? value);
  }

  function handleVolume(value: ScrubValue) {
    volumeController?.keepOpen();
    volumeController?.set(value?.detail ?? value);
  }

  actionRefs.current = {
    currentItems,
    back: popScreen,
    select,
    selectHold: () => {
      const hold = screenByKey(stackTop(screenStackRef.current).key).selectHold;
      if (hold) pushScreen({ key: hold.target });
    },
    play,
    moveBy,
    keyStep: holdStep,
    accelerate: wheelScroll,
    currentScrollTarget: currentScrollTargetFn,
    turnPaddle: (degrees) => brickGameEl.current?.movePaddle(degrees / PADDLE_STEP),
    steerPaddle: (step) => brickGameEl.current?.steerPaddle(step ?? 0),
  };

  useEffect(() => {
    if (!controllers) return undefined;
    return () => {
      controllers.seek.destroy();
      controllers.volume.destroy();
    };
  }, [controllers]);

  useEffect(() => {
    if (!playback) return undefined;
    return playback.onQueueFinished(() => {
      scrollMemory.clearQueueSource();
      const top: StackEntry = stackTop(screenStackRef.current);
      if (screenByKey(top.key).view === "now-playing") {
        actionRefs.current.back?.();
        if (top.selectedItemId === "now-playing") {
          setSelectedIndexNow(0);
          setRestoredScrollTop(undefined);
        }
      }
    });
  }, [playback, scrollMemory]);

  useEffect(() => {
    if (selectedIndex >= currentItems.length)
      setSelectedIndexNow(Math.max(0, currentItems.length - 1));
  }, [currentItems.length, selectedIndex]);

  useEffect(() => {
    if (!playbackState) return;
    scrollMemory.syncQueue(playbackState, screenStackRef.current);
    const index = queueIndexFor(currentItems, playbackState);
    if (index >= 0 && !suppressSyncRef.current) setSelectedIndexNow(index);
  }, [currentItems, playbackState, scrollMemory]);

  const isIdleArmed = !!playbackState?.isPlaying && !currentDefinition.blocksIdleJump;
  const idleJump = useMemo(() => debounce(IDLE_JUMP_MS, () => actionRefs.current.pushIdle?.()), []);
  actionRefs.current.pushIdle = () => pushScreen(nowPlayingScreen(), true);
  actionRefs.current.notifyActivity = () => {
    if (isIdleArmed) idleJump.start();
  };
  useEffect(() => {
    if (isIdleArmed) idleJump.start();
    else idleJump.stop();
    return () => idleJump.destroy();
  }, [idleJump, isIdleArmed]);

  useEffect(() => {
    const node = menuEl.current?.querySelector<HTMLElement>(".screen-body");
    if (!node) return undefined;
    const options = {
      disabled,
      navigationId,
      mode: VIEW_KEY_MODES[view],
      onArrow: handleArrowKey,
      onSelect: select,
      onBack: popScreen,
      onMenuHold: () => onMenuHold?.(),
    };
    keyboardAction.current = screenKeys(node, options);
    return () => {
      keyboardAction.current?.destroy();
      keyboardAction.current = null;
    };
  }, []);

  useEffect(() => {
    keyboardAction.current?.update({
      disabled,
      navigationId,
      mode: VIEW_KEY_MODES[view],
      onArrow: handleArrowKey,
      onSelect: select,
      onBack: popScreen,
      onMenuHold: () => onMenuHold?.(),
    });
  });

  const screenApi = useMemo<ScreenApi>(
    () => ({
      back: () => actionRefs.current.back?.(),
      select: () => actionRefs.current.select?.(),
      selectHold: () => actionRefs.current.selectHold?.(),
      play: () => actionRefs.current.play?.(),
      moveBy: (direction, step) => actionRefs.current.moveBy?.(direction, step),
      keyStep: (direction, heldMs) => actionRefs.current.keyStep?.(direction, heldMs),
      accelerate: (magnitude, direction) =>
        actionRefs.current.accelerate?.(magnitude, direction) ?? 0,
      currentScrollTarget: () => actionRefs.current.currentScrollTarget?.() ?? "list",
      turnPaddle: (degrees) => actionRefs.current.turnPaddle?.(degrees),
      steerPaddle: (step) => actionRefs.current.steerPaddle?.(step),
      notifyActivity: () => actionRefs.current.notifyActivity?.(),
      get seekController() {
        return controllers?.seek;
      },
      get volumeController() {
        return controllers?.volume;
      },
    }),
    [controllers],
  );

  useImperativeHandle(ref, () => screenApi, [screenApi]);

  useEffect(() => {
    onStateChange?.({ scrollTarget: currentScrollTarget, selectHoldMs, screenApi });
  }, [currentScrollTarget, onStateChange, screenApi, selectHoldMs]);

  const setListScroll = (node: HTMLUListElement | null) => {
    listScrollEl.current = node;
  };

  return (
    <div className="menu" data-testid="menu" ref={menuEl}>
      <MenuTitle
        title={title}
        hasLoadedItem={!!playbackState?.hasLoadedItem}
        isPlaying={!!playbackState?.isPlaying}
        isBrick={view === "brick"}
        brickBalls={brickBalls}
        brickScore={brickScore}
      />
      <div className="screen-body">
        <AnimatedScreen
          navigationId={navigationId}
          isNavigatingBack={isNavigatingBack}
          snapshotRef={transitionSnapshotRef}
        >
          {view === "now-playing" ? (
            <NowPlaying
              i18n={currentI18n}
              songIndex={(playbackState?.queuePosition ?? 0) + 1}
              songCount={playbackState?.queue?.length ?? 0}
              songId={nowPlayingTrack?.id}
              title={nowPlayingTrack?.name}
              titleUrl={nowPlayingTrack?.url}
              navigateToUrl={navigateToUrl}
              artistName={nowPlayingTrack?.artistName}
              albumName={nowPlayingTrack?.albumName}
              currentTime={playbackState?.currentPlaybackTime ?? 0}
              duration={playbackState?.currentPlaybackDuration ?? 0}
              shouldFocus={shouldFocusNextScreen}
              isSeeking={!!seekState?.isSeeking}
              seekPreviewTime={seekState?.seekPreviewTime}
              isAdjustingVolume={!!volumeState?.isAdjustingVolume}
              volume={toPercent(playbackState?.volume ?? 0)}
              isPositionDisabled={!playbackState?.hasLoadedItem}
              shuffleMode={!!playbackState?.shuffleMode}
              repeatMode={playbackState?.repeatMode ?? "none"}
              onScrubFocus={ensureScrubbing}
              onScrub={handleScrub}
              onScrubCommit={() => seekController?.commit()}
              onScrubBlur={() => seekController?.release()}
              onVolumeFocus={handleVolumeFocus}
              onVolume={handleVolume}
              onVolumeBlur={() => volumeController?.release()}
            />
          ) : view === "brick" ? (
            <BrickGame
              ref={brickGameEl}
              i18n={currentI18n}
              score={brickScore}
              balls={brickBalls}
              onScoreChange={setBrickScore}
              onBallsChange={setBrickBalls}
              paused={disabled}
            />
          ) : (
            <MenuList
              key={navigationId}
              i18n={currentI18n}
              items={currentItems}
              selectedIndex={selectedIndex}
              navigationId={navigationId}
              shouldFocus={shouldFocusNextScreen}
              restoredScrollTop={restoredScrollTop}
              onListMount={setListScroll}
              onListUnmount={(node) => {
                if (listScrollEl.current === node) listScrollEl.current = null;
              }}
            />
          )}
        </AnimatedScreen>
      </div>
    </div>
  );
}
