import { createLogger } from "../shared/logger.ts";
import { resumeAudioContext } from "./audio-context.ts";

const CLICK_GAIN = 0.3;
const CLICK_TAIL = 0.05;
const CLICK_MIN_GAP = 0.15;
const CLICK_RESUME_OFFSET = 0.08;
const CLICK_RESUME_DEBOUNCE = 200;

export interface Clicker {
  playClick(): void;
  destroy(): void;
}

export function createClicker(audioContext: AudioContext, soundUrl: string): Clicker {
  const logger = createLogger("<ClickSoundPlayer>");
  const controller = new AbortController();
  const gain = audioContext.createGain();
  gain.gain.value = CLICK_GAIN;
  gain.connect(audioContext.destination);
  let buffer: AudioBuffer | null = null;
  let nextStartAt = 0;
  let resumeRequestedAt: number | null = null;

  async function load() {
    try {
      const response = await fetch(soundUrl, { signal: controller.signal });
      buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      logger.debug("Click sound loaded successfully");
    } catch (error) {
      if (!controller.signal.aborted) logger.error("Failed to load or decode click sound", error);
    }
  }
  load();

  function play() {
    if (!buffer || controller.signal.aborted) return;
    const { currentTime } = audioContext;
    if (nextStartAt - currentTime >= CLICK_MIN_GAP) return;
    const startAt = Math.max(currentTime, nextStartAt);
    try {
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(startAt);
      nextStartAt = startAt + CLICK_TAIL;
    } catch (error) {
      logger.error("Error during click sound playback", error);
    }
  }

  function onStateChange() {
    if (audioContext.state !== "running") return;
    nextStartAt = Math.max(nextStartAt, audioContext.currentTime + CLICK_RESUME_OFFSET);
    if (resumeRequestedAt === null) return;
    const stale = Date.now() - resumeRequestedAt > CLICK_RESUME_DEBOUNCE;
    resumeRequestedAt = null;
    if (!stale) play();
  }
  audioContext.addEventListener("statechange", onStateChange);

  function playClick() {
    if (audioContext.state !== "running") {
      resumeAudioContext(audioContext);
      if (resumeRequestedAt === null) resumeRequestedAt = Date.now();
      return;
    }
    play();
  }

  return {
    playClick,
    destroy() {
      controller.abort();
      audioContext.removeEventListener("statechange", onStateChange);
      gain.disconnect();
    },
  };
}
