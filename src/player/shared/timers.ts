export interface DebounceTimer {
  start(): void;
  stop(): void;
  flush(): void;
  destroy(): void;
}

export function debounce(ms: number, callback: () => void): DebounceTimer {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear() {
    clearTimeout(timer);
    timer = undefined;
  }
  function start() {
    clear();
    timer = setTimeout(() => {
      timer = undefined;
      callback();
    }, ms);
  }
  function stop() {
    if (timer !== undefined) {
      clear();
      callback();
    }
  }
  return { start, stop, flush: stop, destroy: clear };
}

export interface IdleTimerOptions {
  timeoutMs: number;
  isActive(): boolean;
  enter(): void;
  onLeave(): void;
}

export interface IdleTimer {
  restartIdleTimer(): void;
  keepOpen(): void;
  release(): void;
  exit(): void;
  reenter(): void;
  handleScreenChange(isCurrentScreen: boolean): void;
  destroy(): void;
}

export function createIdleTimer({
  timeoutMs,
  isActive,
  enter,
  onLeave,
}: IdleTimerOptions): IdleTimer {
  let pinned = false;
  const timer = debounce(timeoutMs, leaveIfActive);

  function leaveIfActive() {
    if (isActive()) {
      timer.stop();
      onLeave();
    }
  }
  function restartIdleTimer() {
    if (!pinned) timer.start();
  }
  function keepOpen() {
    pinned = true;
    timer.stop();
    if (!isActive()) enter();
  }
  function release() {
    pinned = false;
    if (isActive()) timer.start();
  }
  function exit() {
    pinned = false;
    leaveIfActive();
  }
  function reenter() {
    const wasPinned = pinned;
    leaveIfActive();
    if (wasPinned) enter();
  }
  function handleScreenChange(isCurrentScreen: boolean) {
    if (!isCurrentScreen) exit();
  }
  return {
    restartIdleTimer,
    keepOpen,
    release,
    exit,
    reenter,
    handleScreenChange,
    destroy: timer.destroy,
  };
}
