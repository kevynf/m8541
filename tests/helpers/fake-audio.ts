import type { TestContext } from "node:test";

export interface FakeAudioElement {
  src: string;
  duration: number;
  currentTime: number;
  paused: boolean;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  removeAttribute(name: string): void;
  tick(time: number): void;
  finish(): void;
}

export interface FakeAudioParam {
  value: number;
  cancelScheduledValues(startTime: number): void;
  setValueCurveAtTime(values: ArrayLike<number>, startTime: number, duration: number): void;
  setValueAtTime(value: number, startTime: number): void;
  setTargetAtTime(value: number, startTime: number, timeConstant: number): void;
}

export interface FakeAudioNode {
  connect(destination: AudioNode): AudioNode;
  disconnect(): void;
}

export interface FakeGainNode extends FakeAudioNode {
  gain: FakeAudioParam;
}

export interface FakeAudioInstallation {
  FakeAudioContext: new () => AudioContext;
  audios: FakeAudioElement[];
}

export function installFakeAudio(t: TestContext): FakeAudioInstallation {
  const previousAudio = Object.getOwnPropertyDescriptor(globalThis, "Audio");
  const audios: FakeAudioElement[] = [];

  class FakeAudio extends EventTarget implements FakeAudioElement {
    src = "";
    duration = 6;
    currentTime = 0;
    paused = true;

    constructor() {
      super();
      audios.push(this);
    }

    async play() {
      this.paused = false;
    }

    pause() {
      this.paused = true;
    }

    load() {}

    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    }

    tick(time: number) {
      this.currentTime = time;
      this.dispatchEvent(new Event("timeupdate"));
    }

    finish() {
      this.paused = true;
      this.dispatchEvent(new Event("ended"));
    }
  }

  class FakeAudioContext {
    currentTime = 0;
    destination = {};

    createGain(): FakeGainNode {
      return {
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueCurveAtTime() {},
          setValueAtTime() {},
          setTargetAtTime() {},
        },
        connect: (destination: AudioNode): AudioNode => destination,
        disconnect() {},
      };
    }

    createMediaElementSource(): FakeAudioNode {
      return {
        connect: (destination: AudioNode): AudioNode => destination,
        disconnect() {},
      };
    }
  }

  Object.defineProperty(globalThis, "Audio", {
    configurable: true,
    writable: true,
    value: FakeAudio,
  });
  t.after(() => {
    if (previousAudio) Object.defineProperty(globalThis, "Audio", previousAudio);
    else Reflect.deleteProperty(globalThis, "Audio");
  });

  return { FakeAudioContext: FakeAudioContext as unknown as new () => AudioContext, audios };
}
