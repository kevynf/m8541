import { createI18n } from "../i18n.ts";

export interface I18n {
  t(key: string, params?: Record<string, unknown>): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatList(values: readonly string[]): string;
}

const defaultI18n: I18n = createI18n();

export function formatTime(seconds: number, i18n: I18n = defaultI18n) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = i18n.formatNumber(Math.floor(total / 60), {
    useGrouping: false,
  });
  const secs = i18n.formatNumber(total % 60, { minimumIntegerDigits: 2 });
  return `${minutes}:${secs}`;
}

export function formatRemaining(time: number, duration: number, i18n: I18n = defaultI18n) {
  if (!Number.isFinite(duration) || duration <= 0) return "";
  return `-${formatTime(Math.ceil(duration - time), i18n)}`;
}

export function formatDuration(value: number, i18n: I18n = defaultI18n) {
  const total = Math.max(0, Math.floor(value));
  const unit = (n: number, u: string) =>
    i18n.formatNumber(n, { style: "unit", unit: u, unitDisplay: "long" });
  const parts: [number, string][] = [
    [Math.floor(total / 3600), "hour"],
    [Math.floor(total / 60) % 60, "minute"],
    [total % 60, "second"],
  ];
  const labels = parts.filter(([n]) => n > 0).map(([n, u]) => unit(n, u));
  return labels.length ? i18n.formatList(labels) : unit(0, "second");
}
