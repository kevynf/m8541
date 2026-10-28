export interface DivmodResult {
  count: number;
  remainder: number;
}

export function divmod(value: number, size: number): DivmodResult {
  const count = Math.floor(value / size);
  return { count, remainder: value - count * size };
}

export function toPercent(volume: number): number {
  return Math.round(volume * 100);
}

export function fromPercent(percent: number): number {
  return percent / 100;
}
