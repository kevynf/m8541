import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BALL_R,
  BRICK_H,
  HEIGHT,
  PADDLE_H,
  PADDLE_W,
  WIDTH,
  createEngine,
  levelDuration,
} from "../src/player/brick/engine.ts";

test("brick collision increments score, removes one brick and advances a cleared level", () => {
  const engine = createEngine();
  const { state } = engine;
  const firstBrick = state.bricks[0];
  state.bricks = [firstBrick];
  state.ball = { x: firstBrick.x + 1, y: firstBrick.y + BRICK_H + 1, dx: 0.1, dy: -2 };
  state.isBallInPlay = true;

  engine.tick();

  assert.equal(state.score, 1);
  assert.equal(firstBrick.destroyed, true);
  assert.equal(state.level, 2);
  assert.equal(state.bricks.length, 36);
  assert.ok(state.serveTicks > 0);
  assert.ok(levelDuration(3) < levelDuration(1));
});

test("walls and paddle reverse the corresponding ball velocity", () => {
  const engine = createEngine();
  const { state } = engine;
  state.bricks = [];
  state.isBallInPlay = true;
  state.ball = { x: BALL_R, y: 50, dx: -1, dy: 0 };
  engine.tick();
  assert.ok(state.ball.dx > 0, "left-wall contact reverses horizontal velocity");

  state.paddleX = (WIDTH - PADDLE_W) / 2;
  state.ball = {
    x: state.paddleX + PADDLE_W / 2,
    y: HEIGHT - PADDLE_H - BALL_R - 1,
    dx: 0,
    dy: 2,
  };
  engine.tick();
  assert.ok(state.ball.dy < 0, "paddle contact sends the ball upward");
});

test("last lost ball ends the game, and a new launch resets its score", () => {
  const engine = createEngine();
  const { state } = engine;
  state.isBallInPlay = true;
  state.balls = 1;
  state.score = 9;
  state.ball.y = HEIGHT - 1;
  state.ball.dy = 3;

  engine.tick();
  assert.equal(state.balls, 0);
  assert.equal(state.isGameOver, true);
  engine.launchBall();
  assert.equal(state.isGameOver, false);
  assert.equal(state.balls, 3);
  assert.equal(state.score, 0);
  assert.equal(state.isBallInPlay, false);
});
