import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { createI18n } from "../i18n.ts";
import type { I18n } from "../i18n.ts";
import { createFramebuffer, createPainter, INK_BRICK, INK_PADDLE } from "./renderer.ts";
import type { Framebuffer, GameState, Painter } from "./types.ts";
import {
  createEngine,
  levelDuration,
  WIDTH,
  HEIGHT,
  BRICK_W,
  BRICK_H,
  PADDLE_W,
  PADDLE_H,
  BALL_R,
  MAX_TICKS_PER_FRAME,
  WHEEL_STEP,
} from "./engine.ts";
import type { Engine } from "./types.ts";

function messageFor(state: GameState, i18n: I18n) {
  return state.isGameOver
    ? i18n.t("ASE.Web.M8541.Game.GameOver")
    : state.isBallInPlay || state.serveTicks > 0
      ? ""
      : i18n.t("ASE.Web.M8541.Game.LaunchBall");
}

export interface BrickGameHandle {
  movePaddle(delta: number): void;
  steerPaddle(step: number): void;
  launchBall(): void;
}

interface BrickGameProps {
  paused?: boolean;
  score?: number;
  balls?: number;
  i18n?: I18n;
  onScoreChange?: (score: number) => void;
  onBallsChange?: (balls: number) => void;
  ref?: Ref<BrickGameHandle>;
}

export default function BrickGame({
  paused = false,
  score = 0,
  balls = 0,
  i18n,
  onScoreChange,
  onBallsChange,
  ref,
}: BrickGameProps) {
  const engineRef = useRef<Engine | null>(null);
  if (engineRef.current === null) engineRef.current = createEngine();
  const engine = engineRef.current;
  const framebufferRef = useRef<Framebuffer | null>(null);
  if (framebufferRef.current === null) framebufferRef.current = createFramebuffer(WIDTH, HEIGHT);
  const framebuffer = framebufferRef.current;

  const fallbackI18n = useRef<I18n | null>(null);
  const currentI18n = i18n ?? fallbackI18n.current ?? createI18n();
  fallbackI18n.current = currentI18n;
  const i18nRef = useRef(currentI18n);
  i18nRef.current = currentI18n;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painterRef = useRef<Painter | null>(null);
  const rafIdRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);
  const accumulatedRef = useRef(0);
  const wheelDirRef = useRef(0);
  const wheelMovedRef = useRef(false);
  const dirtyRef = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const scoreRef = useRef(score);
  const ballsRef = useRef(balls);
  const onScoreChangeRef = useRef(onScoreChange);
  onScoreChangeRef.current = onScoreChange;
  const onBallsChangeRef = useRef(onBallsChange);
  onBallsChangeRef.current = onBallsChange;

  const [message, setMessage] = useState(() => messageFor(engine.state, currentI18n));
  const messageRef = useRef(message);

  function fillRect(x: number, y: number, w: number, h: number, ink = INK_BRICK) {
    const px = Math.round(x);
    const py = Math.round(y);
    const x0 = Math.max(px, 0);
    const x1 = Math.min(px + w, WIDTH);
    const y1 = Math.min(py + h, HEIGHT);
    for (let row = Math.max(py, 0); row < y1; row += 1)
      framebuffer.drive.fill(ink, row * WIDTH + x0, row * WIDTH + x1);
  }

  function redraw() {
    const state = engine.state;
    framebuffer.drive.fill(0);
    for (const brick of state.bricks)
      if (!brick.destroyed) fillRect(brick.x, brick.y, BRICK_W, BRICK_H);
    fillRect(state.paddleX, HEIGHT - PADDLE_H, PADDLE_W, PADDLE_H, INK_PADDLE);
    fillRect(state.ball.x - BALL_R, state.ball.y - BALL_R, BALL_R * 2, BALL_R * 2);
    dirtyRef.current = false;
  }

  function syncState() {
    const state = engine.state;
    if (state.score !== scoreRef.current) {
      scoreRef.current = state.score;
      onScoreChangeRef.current?.(state.score);
    }
    if (state.balls !== ballsRef.current) {
      ballsRef.current = state.balls;
      onBallsChangeRef.current?.(state.balls);
    }
    const nextMessage = messageFor(state, i18nRef.current);
    if (nextMessage !== messageRef.current) {
      messageRef.current = nextMessage;
      setMessage(nextMessage);
    }
  }

  function frame(time: number) {
    const state = engine.state;
    const delta = lastTimeRef.current === undefined ? 0 : time - lastTimeRef.current;
    lastTimeRef.current = time;
    const tickMs = levelDuration(state.level);
    accumulatedRef.current = Math.min(accumulatedRef.current + delta, tickMs * MAX_TICKS_PER_FRAME);
    let ticked = false;
    while (accumulatedRef.current >= tickMs) {
      accumulatedRef.current -= tickMs;
      ticked = true;
      if (!pausedRef.current) {
        engine.movePaddle(wheelDirRef.current * WHEEL_STEP);
        if (!wheelMovedRef.current) wheelMovedRef.current = wheelDirRef.current !== 0;
        engine.tick();
      }
    }
    if (ticked) {
      redraw();
      syncState();
    }
    const faded = framebuffer.fade(delta);
    if (ticked || faded) painterRef.current?.paint();
    rafIdRef.current =
      ((state.isBallInPlay || state.serveTicks > 0) && !pausedRef.current) ||
      dirtyRef.current ||
      faded ||
      (wheelDirRef.current !== 0 && !pausedRef.current)
        ? requestAnimationFrame(frame)
        : undefined;
  }

  function start() {
    if (rafIdRef.current === undefined) {
      lastTimeRef.current = undefined;
      rafIdRef.current = requestAnimationFrame(frame);
    }
  }

  function stop() {
    if (rafIdRef.current !== undefined) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = undefined;
    }
  }

  function movePaddle(delta: number) {
    engine.movePaddle(delta);
    dirtyRef.current = true;
    start();
  }

  function steerPaddle(step: number) {
    if (step === 0 && !wheelMovedRef.current && !pausedRef.current)
      movePaddle(wheelDirRef.current * WHEEL_STEP);
    wheelDirRef.current = step;
    wheelMovedRef.current = false;
    start();
  }

  function launchBall() {
    engine.launchBall();
    dirtyRef.current = true;
    syncState();
    start();
  }

  useImperativeHandle(ref, () => ({ movePaddle, steerPaddle, launchBall }), []);

  useLayoutEffect(() => {
    redraw();
    framebuffer.settle();
    const canvas = canvasRef.current;
    painterRef.current = canvas ? createPainter(canvas, framebuffer) : null;
    syncState();
    return () => {
      stop();
      painterRef.current?.destroy();
      painterRef.current = null;
    };
  }, []);

  useEffect(() => {
    syncState();
  }, [currentI18n]);

  useEffect(() => {
    if (!paused) start();
  }, [paused]);

  return (
    <div className="brick-game-screen" data-testid="brick-game">
      <canvas
        ref={canvasRef}
        className="game-area"
        data-testid="game-area"
        aria-hidden="true"
        width={WIDTH}
        height={HEIGHT}
      />
      <p className="game-message" data-testid="game-message" role="status">
        {message}
      </p>
    </div>
  );
}
