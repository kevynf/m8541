import type { Framebuffer, Painter } from "./types.ts";

const FADE_FAST = 20;
const FADE_NORMAL = 70;
const FADE_SLOW = 25;
const FADE_EPS = 1 / 255;
export const INK_BRICK = 1;
export const INK_PADDLE = 2;
const SCALE_THRESHOLD = 3;
const EDGE_SOFTNESS = 0.7;

export function createFramebuffer(width: number, height: number): Framebuffer {
  const drive = new Uint8Array(width * height);
  const current = new Float32Array(width * height);
  const ink = new Float32Array(width * height);
  const held = new Uint8Array(width * height);

  function fade(dt: number): boolean {
    const fast = 1 - Math.exp(-dt / FADE_FAST);
    const normal = 1 - Math.exp(-dt / FADE_NORMAL);
    const slow = 1 - Math.exp(-dt / FADE_SLOW);
    let changed = false;
    for (let i = 0; i < ink.length; i += 1) {
      const target = drive[i] === 0 ? 0 : 1;
      held[i] = drive[i] || held[i];
      if (Math.abs(target - current[i]) > FADE_EPS || Math.abs(target - ink[i]) > FADE_EPS) {
        const rate = held[i] === INK_PADDLE ? slow : normal;
        const diff = target - current[i];
        current[i] += diff * (diff > 0 ? fast : rate);
        const diff2 = current[i] - ink[i];
        ink[i] += diff2 * (diff2 > 0 ? fast : rate);
        changed = true;
      } else {
        if (!changed) changed = current[i] !== target || ink[i] !== target;
        current[i] = target;
        ink[i] = target;
      }
    }
    return changed;
  }

  function settle(): void {
    for (let i = 0; i < ink.length; i += 1) {
      held[i] = drive[i] || held[i];
      current[i] = drive[i] === 0 ? 0 : 1;
      ink[i] = current[i];
    }
  }

  return { width, height, drive, ink, fade, settle };
}

function pixelCoverage(pixel: number, scale: number): number {
  const center = Math.round((pixel + 0.5) / scale) * scale;
  return 1 - (1 - EDGE_SOFTNESS) * Math.max(0, 1 - Math.abs(pixel + 0.5 - center));
}

export function createPainter(canvas: HTMLCanvasElement, framebuffer: Framebuffer): Painter {
  const ctx = canvas.getContext("2d");
  let imageData: ImageData | undefined;
  let pixelMap = new Int32Array(0);
  let pixelWeight = new Float32Array(0);
  let resolutionQuery: MediaQueryList | undefined;

  function buildPixelMap(): void {
    const { width: cssWidth, height: cssHeight } = canvas;
    const scale = cssWidth / framebuffer.width;
    const upscaling = scale > 1;
    pixelMap = new Int32Array(cssWidth * cssHeight);
    pixelWeight = new Float32Array(cssWidth * cssHeight);
    for (let y = 0; y < cssHeight; y += 1) {
      const srcY = Math.min(Math.floor((y + 0.5) / scale), framebuffer.height - 1);
      const weightY = upscaling ? pixelCoverage(y, scale) : 1;
      for (let x = 0; x < cssWidth; x += 1) {
        const srcX = Math.floor((x + 0.5) / scale);
        pixelMap[y * cssWidth + x] = srcY * framebuffer.width + srcX;
        pixelWeight[y * cssWidth + x] = weightY * (upscaling ? pixelCoverage(x, scale) : 1) * 255;
      }
    }
  }

  function paint(): void {
    if (ctx && imageData) {
      for (let i = 0; i < pixelMap.length; i += 1)
        imageData.data[i * 4 + 3] = framebuffer.ink[pixelMap[i]] * pixelWeight[i];
      ctx.putImageData(imageData, 0, 0);
    }
  }

  function resize(): void {
    const style = getComputedStyle(canvas);
    const scale = Number(style.getPropertyValue("--m8541-scale")) || 1;
    const desired = Math.round(canvas.clientWidth * scale * devicePixelRatio);
    const width = desired >= framebuffer.width * SCALE_THRESHOLD ? desired : framebuffer.width;
    if (!(imageData && width === canvas.width)) {
      canvas.width = width;
      canvas.height = Math.round((width * framebuffer.height) / framebuffer.width);
      buildPixelMap();
      imageData = ctx?.createImageData(canvas.width, canvas.height);
      if (imageData) {
        const [r = 0, g = 0, b = 0] = style.color.match(/\d+/g)?.map(Number) ?? [];
        for (let i = 0; i < imageData.data.length; i += 4) imageData.data.set([r, g, b], i);
      }
      paint();
    }
  }

  function watchResolution(): void {
    resolutionQuery?.removeEventListener("change", watchResolution);
    resolutionQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    resolutionQuery.addEventListener("change", watchResolution);
    resize();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas.closest(".m8541-host") ?? canvas);
  watchResolution();

  return {
    paint,
    destroy() {
      observer.disconnect();
      resolutionQuery?.removeEventListener("change", watchResolution);
    },
  };
}
