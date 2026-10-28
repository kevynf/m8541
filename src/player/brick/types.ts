export interface Brick {
  x: number;
  y: number;
  destroyed: boolean;
}

export interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export type BrickHit = "side" | "face";

export interface GameState {
  paddleX: number;
  ball: Ball;
  isBallInPlay: boolean;
  serveTicks: number;
  bricks: Brick[];
  score: number;
  balls: number;
  level: number;
  isGameOver: boolean;
}

export interface Engine {
  readonly state: GameState;
  movePaddle(delta: number): void;
  launchBall(): void;
  tick(): void;
}

export interface Framebuffer {
  readonly width: number;
  readonly height: number;
  readonly drive: Uint8Array;
  readonly ink: Float32Array;
  fade(dt: number): boolean;
  settle(): void;
}

export interface Painter {
  paint(): void;
  destroy(): void;
}
