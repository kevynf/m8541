import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ClickWheel from "./wheel/ClickWheel.tsx";
import type { HoldRepeatDetail, KeyScrollDetail, WheelScrollDetail } from "./wheel/ClickWheel.tsx";
import type { ScrollTarget } from "./wheel/scrolling.ts";
import Screen from "./navigation/Screen.tsx";
import type { ScreenApi } from "./navigation/Screen.tsx";
import LoadingScreen from "./device/LoadingScreen.tsx";
import OverlayScreen from "./device/OverlayScreen.tsx";
import { createI18n } from "./i18n.ts";
import type { HostI18n } from "./i18n.ts";
import { createLogger } from "./shared/logger.ts";
import { useStore } from "./shared/use-store.ts";
import { createStore, getStore } from "./shared/store.ts";
import type { ReadableStore } from "./shared/store.ts";
import { settings, Shuffle, Repeat, Clicker, onBacklightChange } from "./settings/store.ts";
import { isOnline } from "./device/connectivity.ts";
import { createBacklightManager } from "./device/backlight.ts";
import { createCatalogStore } from "./catalog/store.ts";
import type { CatalogState } from "./catalog/types.ts";
import { createPlaybackStore } from "./playback/store.ts";
import type { PlaybackState, PlaybackStore } from "./playback/store.ts";
import type { HostPlayback } from "./playback/host-player.ts";
import type { RepeatMode } from "./playback/web-audio-player.ts";
import { createClicker } from "./playback/clicker.ts";
import type { Clicker as ClickSoundPlayer } from "./playback/clicker.ts";
import { resumeAudioContext } from "./playback/audio-context.ts";
import { createScrollApplier } from "./wheel/scrolling.ts";
import { createSeekStepper } from "./playback/seek-stepper.ts";
import type { SeekStepper } from "./playback/seek-stepper.ts";
import { debounce } from "./shared/timers.ts";
import { fromPercent, toPercent } from "./shared/math.ts";
import clickSound from "../assets/audio/click.wav?url";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const logger = createLogger("<M8541>");
const MIN_DISPLAY_MS = 2000;
const MAX_HOLD_MS = 10000;
const VOLUME_SYNC_MS = 1000;
const REPEAT_MODES: Record<string, RepeatMode> = {
  [Repeat.OFF]: "none",
  [Repeat.ONE]: "one",
  [Repeat.ALL]: "all",
};
const PENDING_CATALOG = createStore<CatalogState>({ status: "loading" });
const PENDING_PLAYBACK: ReadableStore<PlaybackState> = {
  subscribe: () => () => {},
  get: () => ({
    isPlaying: false,
    currentPlaybackTime: 0,
    currentPlaybackDuration: 0,
    currentTrackIndex: 0,
    queuePosition: 0,
    queue: [],
    hasLoadedItem: false,
    isLoading: false,
    volume: 1,
    shuffleMode: false,
    repeatMode: "none",
    playerReady: false,
  }),
};
const PENDING_BACKLIGHT = createStore(false);

interface M8541Resources {
  audioContext: AudioContext;
  clicker: ClickSoundPlayer;
  player: PlaybackStore;
  backlight: ReturnType<typeof createBacklightManager>;
  catalog: ReturnType<typeof createCatalogStore>;
}

interface WheelState {
  scrollTarget: ScrollTarget;
  selectHoldMs: number | null;
  screenApi?: ScreenApi;
}

interface M8541Props {
  catalogUrl?: string;
  dragStepDegrees?: number;
  backlit?: boolean | string;
  playback?: HostPlayback;
  navigateToUrl?: (url: string) => void | Promise<void>;
  language?: string;
  i18n?: HostI18n;
}

export default function M8541({
  catalogUrl,
  dragStepDegrees = 15,
  backlit,
  playback: hostPlayback,
  navigateToUrl,
  language = "en-US",
  i18n: hostI18n,
}: M8541Props) {
  const settingValues = useStore(settings);
  const online = useStore(isOnline);
  const [resources, setResources] = useState<M8541Resources | null>(null);
  const [minDisplayTimeElapsed, setMinDisplayTimeElapsed] = useState(false);
  const [maxHoldElapsed, setMaxHoldElapsed] = useState(false);
  const [liveRegionMounted, setLiveRegionMounted] = useState(false);
  const [volumePercent, setVolumePercent] = useState(settingValues.volume);
  const [wheelState, setWheelState] = useState<WheelState>({
    scrollTarget: "list",
    selectHoldMs: null,
  });
  const screenRef = useRef<ScreenApi | null>(null);
  const volumePercentRef = useRef(volumePercent);
  const hasBootedRef = useRef(false);
  const volumeDebounce = useMemo(
    () =>
      debounce(VOLUME_SYNC_MS, () => {
        settings.update((current) => ({ ...current, volume: volumePercentRef.current }));
      }),
    [],
  );
  const seekStepper: SeekStepper = useMemo(() => createSeekStepper(), []);

  useEffect(() => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const clicker = createClicker(audioContext, clickSound);
    const player = createPlaybackStore(audioContext);
    const backlight = createBacklightManager();
    const catalog = createCatalogStore();
    setResources({ audioContext, clicker, player, backlight, catalog });

    return () => {
      volumeDebounce.flush();
      player.destroy();
      clicker.destroy();
      backlight.destroy();
      catalog.destroy();
      audioContext.close().catch(() => {});
    };
  }, [volumeDebounce]);

  useEffect(() => {
    volumePercentRef.current = volumePercent;
  }, [volumePercent]);

  const catalogState = useStore(resources?.catalog.catalog ?? PENDING_CATALOG);
  const playbackState = useStore(resources?.player ?? PENDING_PLAYBACK);
  const backlightValue = useStore(resources?.backlight ?? PENDING_BACKLIGHT);
  const currentI18n = useMemo(() => createI18n(hostI18n, language), [hostI18n, language]);
  const backlightOverride = typeof backlit === "string" ? backlit !== "false" : backlit;
  const isBacklit = backlightOverride ?? backlightValue;
  const isSeeking = wheelState.scrollTarget === "seek";
  const offlineMessage = currentI18n.t("ASE.Web.M8541.Error.NotConnected");
  const isLoading =
    (!maxHoldElapsed && catalogState.status === "loading") || !minDisplayTimeElapsed;
  const isInert = isLoading || !online;
  const hasBooted = hasBootedRef.current;
  const liveMessage = liveRegionMounted
    ? online
      ? currentI18n.t(isLoading ? "ASE.Web.M8541.Status.Loading" : "ASE.Web.M8541.Status.Ready")
      : offlineMessage
    : "";

  useEffect(() => {
    if (!resources) return;
    resources.player.setVolume(fromPercent(settingValues.volume));
  }, [resources, settingValues.volume]);

  useEffect(() => {
    if (!resources || !hostPlayback) return;
    resources.player.setPlayback(hostPlayback);
  }, [resources, hostPlayback]);

  useEffect(() => {
    if (!resources) return;
    resources.player.setShuffle(settingValues.shuffle === Shuffle.SONGS);
    resources.player.setRepeatMode(REPEAT_MODES[settingValues.repeat]);
  }, [resources, settingValues.shuffle, settingValues.repeat]);

  useEffect(() => {
    if (!resources || !catalogUrl || !online) return;
    resources.catalog.loadCatalog(catalogUrl);
  }, [resources, catalogUrl, online]);

  useEffect(() => {
    if (catalogState.status === "error")
      logger.error("Failed to load the catalog", catalogState.error);
    else logger.debug("M8541 data status:", catalogState);
  }, [catalogState]);

  useEffect(() => {
    if (!isInert) hasBootedRef.current = true;
  }, [isInert]);

  useEffect(() => {
    if (!resources) return;
    if (!online) {
      resources.player.pause();
      return;
    }
    if (hasBooted) {
      setMaxHoldElapsed(true);
      return;
    }
    setMinDisplayTimeElapsed(false);
    setMaxHoldElapsed(false);
    const minTimer = setTimeout(() => setMinDisplayTimeElapsed(true), MIN_DISPLAY_MS);
    const maxTimer = setTimeout(() => setMaxHoldElapsed(true), MAX_HOLD_MS);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [resources, online]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLiveRegionMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!resources) return;
    return onBacklightChange(() => {
      volumeDebounce.stop();
      const next = getStore(settings);
      setVolumePercent(next.volume);
      resources.player.setVolume(fromPercent(next.volume));
    });
  }, [resources, volumeDebounce]);

  useEffect(() => {
    if (!playbackState.playerReady) return;
    const next = toPercent(playbackState.volume);
    if (next !== volumePercent) {
      setVolumePercent(next);
      volumeDebounce.start();
    }
  }, [playbackState.playerReady, playbackState.volume, volumePercent, volumeDebounce]);

  const notifyActivity = useCallback(() => {
    resources?.backlight.notifyActivity();
    screenRef.current?.notifyActivity();
  }, [resources]);

  const handleUserActivity = useCallback(() => {
    if (resources) resumeAudioContext(resources.audioContext);
    notifyActivity();
  }, [resources, notifyActivity]);

  const click = useCallback(
    (count: number, target: ScrollTarget) => {
      if (!resources || settingValues.clicker !== Clicker.ON || target === "seek") return;
      for (let i = 0; i < count; i += 1) resources.clicker.playClick();
    },
    [resources, settingValues.clicker],
  );

  const scrollApplier = useMemo(
    () =>
      createScrollApplier({
        move: (direction: number, step: number) =>
          screenRef.current?.moveBy(direction, step) ?? false,
        click,
      }),
    [click],
  );

  const handleScroll = useCallback(
    (event: CustomEvent<WheelScrollDetail>) => {
      notifyActivity();
      if (isInert || !screenRef.current) return;
      const { step, degrees, speed } = event.detail;
      const target = screenRef.current.currentScrollTarget();
      if (target === "brick") {
        screenRef.current.turnPaddle(step * degrees);
        return;
      }
      scrollApplier.scroll({
        step,
        degrees,
        target,
        multiplier: screenRef.current.accelerate(speed, step),
        dragStepDegrees,
      });
    },
    [notifyActivity, isInert, scrollApplier, dragStepDegrees],
  );

  const handleKeyScroll = useCallback(
    (event: CustomEvent<KeyScrollDetail>) => {
      notifyActivity();
      if (isInert || !screenRef.current) return;
      const { step, heldMs } = event.detail;
      const target = screenRef.current.currentScrollTarget();
      if (screenRef.current.keyStep(step, heldMs)) click(1, target);
    },
    [notifyActivity, isInert, click],
  );

  const handleHoldRepeat = useCallback(
    (direction: number, { repeat }: HoldRepeatDetail) => {
      const { hasLoadedItem, currentTrackIndex, currentPlaybackTime, currentPlaybackDuration } =
        playbackState;
      const time = seekStepper.step(direction, repeat, {
        isInert,
        isSeeking,
        hasLoadedItem,
        currentTrackIndex,
        currentPlaybackTime,
        currentPlaybackDuration,
      });
      if (time !== undefined) {
        notifyActivity();
        resources?.player.seek(time);
      }
    },
    [playbackState, isInert, isSeeking, notifyActivity, resources, seekStepper],
  );

  useEffect(() => {
    if (isSeeking) seekStepper.cancel();
  }, [isSeeking, seekStepper]);

  if (!resources) {
    return (
      <div className="m8541-host" data-testid="player">
        <div className="m8541">
          <div className="m8541-shadow">
            <div className="m8541-shadow-inner">
              <div className="m8541-container">
                <div className="m8541-screen">
                  <LoadingScreen />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const guard =
    (handler: (...args: never[]) => void) =>
    (...args: never[]) => {
      if (!isInert) handler(...args);
    };

  return (
    <div className="m8541-host" data-testid="player">
      <div className="m8541">
        <div className="m8541-shadow">
          <div className="m8541-shadow-inner">
            <div
              className="m8541-container"
              data-testid="m8541-container"
              onPointerDown={handleUserActivity}
              onClick={handleUserActivity}
              onKeyDownCapture={(event) => {
                if (!event.repeat || event.key.startsWith("Arrow")) handleUserActivity();
              }}
            >
              <div
                className={`m8541-screen${isBacklit ? " backlit" : ""}`}
                data-testid="m8541-screen"
              >
                {!online ? (
                  <OverlayScreen message={offlineMessage} />
                ) : isLoading ? (
                  <LoadingScreen />
                ) : null}
                <p className="loading-message" role="status">
                  {liveMessage}
                </p>
                <div className={`menu-layer${isInert ? " hidden" : ""}`} data-testid="menu-layer">
                  <Screen
                    ref={screenRef}
                    data={catalogState.status === "ready" ? catalogState.data : undefined}
                    playback={resources.player}
                    i18n={currentI18n}
                    navigateToUrl={navigateToUrl}
                    disabled={isInert}
                    onMenuHold={resources.backlight.toggle}
                    onStateChange={setWheelState}
                  />
                </div>
              </div>
              <ClickWheel
                scrollTarget={wheelState.scrollTarget}
                dragStepDegrees={dragStepDegrees}
                selectHoldMs={wheelState.selectHoldMs}
                isPlaying={
                  playbackState.hasLoadedItem ? playbackState.isPlaying : playbackState.isLoading
                }
                disabled={isInert}
                disableSkip={isSeeking}
                onScroll={handleScroll}
                onKeyScroll={handleKeyScroll}
                onSteer={(step) => screenRef.current?.steerPaddle(step)}
                onSelect={guard(() => screenRef.current?.select())}
                onSelectHold={guard(() => screenRef.current?.selectHold())}
                onMenu={guard(() => screenRef.current?.back())}
                onMenuHold={resources.backlight.toggle}
                onPlayPause={guard(() => screenRef.current?.play())}
                onDragStart={() => {
                  scrollApplier.reset();
                  if (!isSeeking) screenRef.current?.seekController?.handleDragStart();
                }}
                onDragEnd={() => screenRef.current?.seekController?.handleDragEnd()}
                onBack={guard(() => {
                  if (!isSeeking) resources.player.skipPrevious();
                })}
                onForward={guard(() => {
                  if (!isSeeking) resources.player.skipNext();
                })}
                onBackHold={(event) => handleHoldRepeat(-1, event)}
                onForwardHold={(event) => handleHoldRepeat(1, event)}
                i18n={currentI18n}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
