import type { Ball, Brick, BrickHit, Engine, GameState } from "./types.ts";

export const WIDTH = 148;
export const HEIGHT = 101;
export const PADDLE_W = 30;
export const PADDLE_H = 4;
export const BALL_R = 1.5;
const BRICK_H = 4;
const BRICKS_PER_ROW = 12;
const BRICK_GAP = 2;
const BRICK_TOP = 4;
const MARGIN = 3;
const ROWS_TOP = 3;
export const BRICK_W = (WIDTH - MARGIN * 2 - (BRICKS_PER_ROW - 1) * BRICK_GAP) / BRICKS_PER_ROW;
export { BRICK_H };
const MIN_ROWS = 2;
const MAX_ROWS = 5;
const START_BALLS = 3;
const SERVE_MS = 1000;
const TICK_MS = 40;
const LEVEL_SPEEDUP = 0.1;
const MAX_SPEEDUP = 1.5;
const BALL_SPEED = 1.7;
const BALL_SPEED_VEC = Math.hypot(BALL_SPEED, BALL_SPEED);
const PADDLE_EDGE_BOOST = 0.25;
const PADDLE_ANGLE = 0.8;
const PADDLE_RANGE = WIDTH - PADDLE_W;
const PADDLE_Y = HEIGHT - PADDLE_H;
export const MAX_TICKS_PER_FRAME = 10;
export const WHEEL_STEP = 0.035;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function levelDuration(level: number): number {
  return TICK_MS / Math.min(1 + (level - 1) * LEVEL_SPEEDUP, MAX_SPEEDUP);
}

function brickLayout(level: number): Brick[] {
  const rows = Math.min(MIN_ROWS + level - 1, MAX_ROWS);
  const bricks: Brick[] = [];
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < BRICKS_PER_ROW; col += 1)
      bricks.push({
        x: MARGIN + col * (BRICK_W + BRICK_GAP),
        y: ROWS_TOP + row * (BRICK_H + BRICK_TOP),
        destroyed: false,
      });
  return bricks;
}

function newBall(): Ball {
  return { x: BALL_R, y: HEIGHT / 2, dx: BALL_SPEED, dy: BALL_SPEED };
}

function initialState(): GameState {
  return {
    paddleX: PADDLE_RANGE / 2,
    ball: newBall(),
    isBallInPlay: false,
    serveTicks: 0,
    bricks: brickLayout(1),
    score: 0,
    balls: START_BALLS,
    level: 1,
    isGameOver: false,
  };
}

export function createEngine(): Engine {
  const state = initialState();

  function serve(): void {
    state.ball = newBall();
    state.isBallInPlay = false;
    state.serveTicks = Math.round(SERVE_MS / levelDuration(state.level));
  }

  function loseBall(): void {
    state.balls -= 1;
    if (state.balls > 0) serve();
    else {
      state.isBallInPlay = false;
      state.isGameOver = true;
    }
  }

  function nextLevel(): void {
    state.level += 1;
    state.bricks = brickLayout(state.level);
    serve();
  }

  function bounceOffPaddle(): void {
    const { ball } = state;
    const half = PADDLE_W / 2;
    const offset = clamp((ball.x - (state.paddleX + half)) / half, -1, 1);
    const speed = BALL_SPEED_VEC * (1 + Math.abs(offset) * PADDLE_EDGE_BOOST);
    const dx = offset * PADDLE_ANGLE;
    const mag = Math.hypot(dx, 1);
    ball.dx = (dx / mag) * speed;
    ball.dy = -speed / mag;
  }

  function brickHit(index: number): BrickHit | null {
    const { ball, bricks } = state;
    const { x, y, destroyed } = bricks[index];
    const prev = index - Math.sign(ball.dx);
    if (
      destroyed ||
      ball.x + BALL_R < x ||
      ball.x - BALL_R > x + BRICK_W ||
      ball.y + BALL_R < y ||
      ball.y - BALL_R > y + BRICK_H
    )
      return null;
    const overlapX = ball.dx > 0 ? ball.x + BALL_R - x : x + BRICK_W - ball.x + BALL_R;
    const overlapY = ball.dy > 0 ? ball.y + BALL_R - y : y + BRICK_H - ball.y + BALL_R;
    return !(
      Math.floor(prev / BRICKS_PER_ROW) === Math.floor(index / BRICKS_PER_ROW) &&
      bricks[prev]?.destroyed === false
    ) && overlapX * Math.abs(ball.dy) < overlapY * Math.abs(ball.dx)
      ? (x + BRICK_W / 2 - ball.x) * ball.dx > 0
        ? "side"
        : null
      : (y + BRICK_H / 2 - ball.y) * ball.dy > 0
        ? "face"
        : null;
  }

  function checkBricks(): boolean {
    const { ball } = state;
    for (const [index, brick] of state.bricks.entries()) {
      const hit = brickHit(index);
      if (hit) {
        brick.destroyed = true;
        state.score += 1;
        if (hit === "face") ball.dy = -ball.dy;
        else ball.dx = -ball.dx;
        return true;
      }
    }
    return false;
  }

  function tick(): void {
    const { ball } = state;
    if (state.serveTicks > 0) {
      state.serveTicks -= 1;
      state.isBallInPlay = state.serveTicks === 0;
    }
    if (!state.isBallInPlay) return;
    const abovePaddle = ball.y + BALL_R < PADDLE_Y;
    ball.x += ball.dx;
    ball.y += ball.dy;
    if ((ball.x <= BALL_R && ball.dx < 0) || (ball.x >= WIDTH - BALL_R && ball.dx > 0))
      ball.dx = -ball.dx;
    if (ball.y <= BALL_R && ball.dy < 0) ball.dy = -ball.dy;
    if (ball.y >= HEIGHT) {
      loseBall();
      return;
    }
    if (
      ball.dy > 0 &&
      abovePaddle &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.x + BALL_R >= state.paddleX &&
      ball.x - BALL_R <= state.paddleX + PADDLE_W
    )
      bounceOffPaddle();
    if (checkBricks() && state.bricks.every(({ destroyed }) => destroyed)) nextLevel();
  }

  function movePaddle(delta: number): void {
    if (!state.isGameOver)
      state.paddleX = clamp(state.paddleX + delta * PADDLE_RANGE, 0, PADDLE_RANGE);
  }

  function launchBall(): void {
    if (state.isGameOver) Object.assign(state, initialState());
    else {
      state.isBallInPlay = true;
      state.serveTicks = 0;
    }
  }

  return { state, movePaddle, launchBall, tick };
}
