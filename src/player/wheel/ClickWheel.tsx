import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import MenuIcon from "../shared/icons/MenuIcon.tsx";
import PlayPauseIcon from "../shared/icons/PlayPauseIcon.tsx";
import SkipIcon from "../shared/icons/SkipIcon.tsx";
import { createI18n } from "../i18n.ts";
import type { I18n } from "../i18n.ts";
import { createLogger } from "../shared/logger.ts";
import noiseTexture from "../../assets/img/noise.png?url";
import {
  longpress,
  wheelGesture,
  createHoldTimer,
  LONGPRESS_MS,
  REPEAT_INTERVAL,
  KEYSCROLL_DELAY,
  KEYSCROLL_REPEAT,
} from "./gestures.ts";
import type { ScrollTarget } from "./scrolling.ts";

const logger = createLogger("<ClickWheel>");

export interface WheelScrollDetail {
  step: number;
  degrees: number;
  speed: number;
}

export interface KeyScrollDetail {
  step: number;
  heldMs: number;
}

export interface HoldRepeatDetail {
  repeat: boolean;
}

type WheelButton = "menu" | "back" | "forward" | "playpause" | "select";

type WheelAction =
  | { kind: "none" }
  | { kind: "scroll"; step: number }
  | { kind: "steer"; step: number }
  | {
      kind: "hold";
      button: "menu" | "select" | "back" | "forward";
      duration?: number;
      repeatInterval?: number;
    }
  | { kind: "press"; button: WheelButton };

interface DomAction<TParams> {
  update?: (params: TParams) => void;
  destroy(): void;
}

type StyleWithCustomProperties = CSSProperties & Record<`--${string}`, string | number>;

interface ClickWheelProps {
  scrollTarget?: ScrollTarget;
  dragStepDegrees?: number;
  isPlaying?: boolean;
  selectHoldMs?: number | null;
  disabled?: boolean;
  disableSkip?: boolean;
  i18n?: I18n;
  onScroll?: (event: CustomEvent<WheelScrollDetail>) => void;
  onKeyScroll?: (event: CustomEvent<KeyScrollDetail>) => void;
  onSteer?: (step: number | null) => void;
  onSelect?: () => void;
  onSelectHold?: () => void;
  onMenu?: () => void;
  onMenuHold?: () => void;
  onPlayPause?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onBack?: () => void;
  onForward?: () => void;
  onBackHold?: (event: HoldRepeatDetail) => void;
  onForwardHold?: (event: HoldRepeatDetail) => void;
  selectButtonDiameterPercent?: number;
  scrollWheelDiameterPercent?: number;
}

const WHEEL_BASE = 350;
const DEFAULT_SELECT_BUTTON_PCT = (100 / WHEEL_BASE) * 100;
const DEFAULT_SCROLL_WHEEL_PCT = (276 / WHEEL_BASE) * 100;

function useDomAction<TParams>(
  nodeRef: RefObject<HTMLElement | null>,
  createAction: (node: HTMLElement, params: TParams) => DomAction<TParams>,
  params: TParams,
) {
  const actionRef = useRef<DomAction<TParams> | null>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;
    actionRef.current = createAction(node, paramsRef.current);
    return () => {
      actionRef.current?.destroy();
      actionRef.current = null;
    };
  }, [createAction, nodeRef]);

  useEffect(() => {
    actionRef.current?.update?.(params);
  });
}

function useNodeListener<TEvent extends Event>(
  nodeRef: RefObject<HTMLElement | null>,
  type: string,
  handler: (event: TEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node) return undefined;
    const listener = (event: TEvent) => handlerRef.current(event);
    node.addEventListener(type, listener as EventListener);
    return () => node.removeEventListener(type, listener as EventListener);
  }, [nodeRef, type]);
}

export default function ClickWheel({
  scrollTarget = "list",
  dragStepDegrees = 15,
  isPlaying = false,
  selectHoldMs = null,
  disabled = false,
  disableSkip = false,
  i18n,
  onScroll,
  onKeyScroll,
  onSteer,
  onSelect,
  onSelectHold,
  onMenu,
  onMenuHold,
  onPlayPause,
  onDragStart,
  onDragEnd,
  onBack,
  onForward,
  onBackHold,
  onForwardHold,
  selectButtonDiameterPercent = DEFAULT_SELECT_BUTTON_PCT,
  scrollWheelDiameterPercent = DEFAULT_SCROLL_WHEEL_PCT,
}: ClickWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const forwardButtonRef = useRef<HTMLButtonElement>(null);
  const selectButtonRef = useRef<HTMLButtonElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const heldKeyRef = useRef<string | undefined>(undefined);
  const currentActionRef = useRef<WheelAction | undefined>(undefined);
  const keyDownAtRef = useRef(0);
  const actionScrollTargetRef = useRef<ScrollTarget | undefined>(undefined);
  const actionSelectHoldMsRef = useRef<number | null | undefined>(undefined);
  const lastWheelAtRef = useRef<number | undefined>(undefined);

  const fallbackI18n = useRef<I18n | null>(null);
  const currentI18n = i18n ?? fallbackI18n.current ?? createI18n();
  fallbackI18n.current = currentI18n;

  const selectButtonRadiusRatio = selectButtonDiameterPercent / scrollWheelDiameterPercent;

  function setDragging(dragging: boolean) {
    isDraggingRef.current = dragging;
    setIsDragging(dragging);
  }

  function handleButtonClick(button: WheelButton) {
    if (disableSkip && (button === "back" || button === "forward")) return;
    logger.debug(`${button} button clicked`);
    switch (button) {
      case "menu":
        onMenu?.();
        break;
      case "back":
        onBack?.();
        break;
      case "forward":
        onForward?.();
        break;
      case "playpause":
        onPlayPause?.();
        break;
      case "select":
        onSelect?.();
        break;
      default:
        break;
    }
  }

  function handleHoldRepeat(button: "backhold" | "forwardhold", detail: HoldRepeatDetail) {
    if (disableSkip) return;
    if (button === "backhold") onBackHold?.(detail);
    else if (button === "forwardhold") onForwardHold?.(detail);
  }

  function handleWheelScroll(event: CustomEvent<WheelScrollDetail>) {
    onScroll?.(event);
  }

  function handleMouseWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (disabled) return;
    const delta = event.deltaY || event.deltaX;
    if (delta === 0) return;
    event.preventDefault();
    event.stopPropagation();

    const deltaUnits = event.deltaMode === 0 ? delta / 100 : delta;
    const degrees = Math.abs(deltaUnits) * dragStepDegrees;
    const now = performance.now();
    const elapsed = lastWheelAtRef.current === undefined ? 0 : now - lastWheelAtRef.current;
    lastWheelAtRef.current = now;
    handleWheelScroll(
      new CustomEvent("wheelscroll", {
        detail: {
          step: Math.sign(delta),
          degrees,
          speed: elapsed > 0 ? (degrees / elapsed) * 1000 : 0,
        },
      }),
    );
  }

  function handleWheelDragStart() {
    setDragging(true);
    if (currentActionRef.current?.kind !== "scroll") onDragStart?.();
  }

  function handleWheelDragEnd() {
    setDragging(false);
    if (currentActionRef.current?.kind !== "scroll") onDragEnd?.();
  }

  function keyAction(key: string): WheelAction | undefined {
    switch (key) {
      case "ArrowUp":
      case "ArrowDown":
        return scrollTarget === "brick"
          ? { kind: "none" }
          : {
              kind: "scroll",
              step: key === (scrollTarget === "list" ? "ArrowDown" : "ArrowUp") ? 1 : -1,
            };
      case "ArrowLeft":
      case "ArrowRight": {
        const isLeft = key === "ArrowLeft";
        const dir = isLeft ? -1 : 1;
        if (scrollTarget === "seek") return { kind: "scroll", step: dir };
        if (scrollTarget === "brick") return { kind: "steer", step: dir };
        if (scrollTarget === "volume")
          return {
            kind: "hold",
            button: isLeft ? "back" : "forward",
            repeatInterval: REPEAT_INTERVAL,
          };
        const rtl = wheelRef.current?.parentElement?.matches(":dir(rtl)") ?? false;
        return { kind: "press", button: isLeft !== rtl ? "menu" : "select" };
      }
      case "Enter":
        return selectHoldMs === null
          ? { kind: "press", button: "select" }
          : { kind: "hold", button: "select", duration: selectHoldMs };
      case " ":
        return { kind: "press", button: "playpause" };
      case "Escape":
        return { kind: "hold", button: "menu" };
      default:
        return undefined;
    }
  }

  function keyscroll(step: number) {
    onKeyScroll?.(
      new CustomEvent("keyscroll", {
        detail: { step, heldMs: performance.now() - keyDownAtRef.current },
      }),
    );
  }

  function holdRepeat(repeat: boolean) {
    if (
      scrollTarget !== actionScrollTargetRef.current ||
      selectHoldMs !== actionSelectHoldMsRef.current
    ) {
      cancel(false);
      return;
    }
    const action = currentActionRef.current;
    if (action?.kind === "scroll") keyscroll(action.step);
    else if (action?.kind === "hold") {
      if (action.button === "menu") onMenuHold?.();
      else if (action.button === "select") onSelectHold?.();
      else handleHoldRepeat(`${action.button}hold`, { repeat });
    }
  }

  const actionsRef = useRef({ holdRepeat, cancelPointer });

  const holdTimer = useMemo(
    () => createHoldTimer((repeat) => actionsRef.current.holdRepeat(repeat)),
    [],
  );

  function cancel(press: boolean) {
    const previous = currentActionRef.current;
    const stopped = holdTimer.stop();
    heldKeyRef.current = undefined;
    currentActionRef.current = undefined;
    if (previous?.kind === "scroll") {
      if (!isDraggingRef.current) onDragEnd?.();
    } else if (previous?.kind === "steer") {
      onSteer?.(null);
    } else if (previous && previous.kind !== "none" && press && !stopped) {
      handleButtonClick(previous.button);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== ringRef.current) return;
    if (event.ctrlKey || event.metaKey || event.altKey) {
      cancel(false);
      return;
    }
    const action = keyAction(event.key);
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      if (!(event.repeat || event.key === heldKeyRef.current)) {
        cancel(false);
        heldKeyRef.current = event.key;
        currentActionRef.current = action;
        keyDownAtRef.current = performance.now();
        actionScrollTargetRef.current = scrollTarget;
        actionSelectHoldMsRef.current = selectHoldMs;
        if (action.kind === "scroll") {
          if (!isDraggingRef.current) onDragStart?.();
          keyscroll(action.step);
          holdTimer.start(KEYSCROLL_DELAY, KEYSCROLL_REPEAT);
        } else if (action.kind === "steer") {
          onSteer?.(action.step);
        } else if (action.kind === "hold") {
          holdTimer.start(action.duration ?? LONGPRESS_MS, action.repeatInterval);
        }
      }
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === heldKeyRef.current) {
      event.preventDefault();
      event.stopPropagation();
      cancel(true);
    }
  }

  function focusRing() {
    if (window.matchMedia("(any-pointer: fine)").matches)
      ringRef.current?.focus({ preventScroll: true });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && (event.width > 0 || event.height > 0)) focusRing();
  }

  function cancelPointer() {
    cancel(false);
  }

  function cancelOnFocusOut() {
    cancel(false);
  }

  const menuClick = () => handleButtonClick("menu");
  const menuhold = () => onMenuHold?.();
  const backClick = () => handleButtonClick("back");
  const backhold = (event: CustomEvent<HoldRepeatDetail>) =>
    handleHoldRepeat("backhold", event.detail);
  const forwardClick = () => handleButtonClick("forward");
  const forwardhold = (event: CustomEvent<HoldRepeatDetail>) =>
    handleHoldRepeat("forwardhold", event.detail);
  const playpauseClick = () => handleButtonClick("playpause");
  const selectClick = () => handleButtonClick("select");
  const selecthold = () => onSelectHold?.();

  useEffect(() => {
    return () => {
      holdTimer.stop();
    };
  }, [holdTimer]);

  useDomAction(ringRef, wheelGesture, {
    excludeRadiusRatio: selectButtonRadiusRatio,
  });
  useDomAction(menuButtonRef, longpress, { duration: LONGPRESS_MS });
  useDomAction(backButtonRef, longpress, {
    duration: LONGPRESS_MS,
    repeatInterval: REPEAT_INTERVAL,
  });
  useDomAction(forwardButtonRef, longpress, {
    duration: LONGPRESS_MS,
    repeatInterval: REPEAT_INTERVAL,
  });
  useDomAction(selectButtonRef, longpress, {
    duration: selectHoldMs ?? LONGPRESS_MS,
    keyboard: false,
    disabled: selectHoldMs === null,
  });

  useNodeListener<CustomEvent<WheelScrollDetail>>(ringRef, "wheelscroll", handleWheelScroll);
  useNodeListener<CustomEvent<WheelScrollDetail>>(ringRef, "wheeldragstart", handleWheelDragStart);
  useNodeListener<CustomEvent<WheelScrollDetail>>(ringRef, "wheeldragend", handleWheelDragEnd);
  useNodeListener<CustomEvent<HoldRepeatDetail>>(menuButtonRef, "longpress", menuhold);
  useNodeListener<CustomEvent<HoldRepeatDetail>>(backButtonRef, "longpress", backhold);
  useNodeListener<CustomEvent<HoldRepeatDetail>>(forwardButtonRef, "longpress", forwardhold);
  useNodeListener<CustomEvent<HoldRepeatDetail>>(selectButtonRef, "longpress", selecthold);

  useEffect(() => {
    const onWindowBlur = () => actionsRef.current.cancelPointer();
    window.addEventListener("blur", onWindowBlur);
    return () => window.removeEventListener("blur", onWindowBlur);
  }, []);

  const wheelStyle: StyleWithCustomProperties = {
    "--select-button-pct": `${selectButtonDiameterPercent}%`,
    "--scroll-wheel-pct": `${scrollWheelDiameterPercent}%`,
    "--wheel-noise-texture": `url(${noiseTexture})`,
  };

  return (
    <div
      ref={wheelRef}
      className={`click-wheel${isDragging ? " dragging" : ""}`}
      data-testid="click-wheel"
      role="group"
      aria-label="Click wheel"
      dir="ltr"
      tabIndex={-1}
      style={wheelStyle}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={cancelOnFocusOut}
      onPointerUp={handlePointerUp}
      onWheel={handleMouseWheel}
    >
      <button
        type="button"
        ref={menuButtonRef}
        className="wheel-button menu-button"
        data-testid="wheel-menu-button"
        aria-label={currentI18n.t("ASE.Web.M8541.Wheel.Menu")}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={menuClick}
      >
        <MenuIcon aria-hidden="true" />
      </button>{" "}
      <button
        type="button"
        ref={backButtonRef}
        className="wheel-button back-button"
        data-testid="wheel-back-button"
        aria-label={currentI18n.t("ASE.Web.M8541.Wheel.Back")}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || disableSkip}
        onClick={backClick}
      >
        <SkipIcon aria-hidden="true" />
      </button>{" "}
      <button
        type="button"
        ref={forwardButtonRef}
        className="wheel-button forward-button"
        data-testid="wheel-forward-button"
        aria-label={currentI18n.t("ASE.Web.M8541.Wheel.Forward")}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || disableSkip}
        onClick={forwardClick}
      >
        <SkipIcon aria-hidden="true" />
      </button>{" "}
      <button
        type="button"
        className="wheel-button playpause-button"
        data-testid="wheel-playpause-button"
        aria-label={currentI18n.t(
          isPlaying ? "ASE.Web.M8541.Wheel.Pause" : "ASE.Web.M8541.Wheel.Play",
        )}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={playpauseClick}
      >
        <PlayPauseIcon aria-hidden="true" />
      </button>{" "}
      <div className="wheel-dividers" />{" "}
      <div
        ref={ringRef}
        className="scroll-wheel"
        data-testid="wheel-ring"
        aria-hidden="true"
        tabIndex={-1}
        onPointerDown={focusRing}
      />{" "}
      <button
        type="button"
        ref={selectButtonRef}
        className="select-button"
        data-testid="wheel-select-button"
        aria-label={currentI18n.t("ASE.Web.M8541.Wheel.Select")}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        onClick={selectClick}
      />
    </div>
  );
}
