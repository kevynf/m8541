export type LogArgs = unknown[];

export interface Logger {
  debug(...args: LogArgs): void;
  info(...args: LogArgs): void;
  warn(...args: LogArgs): void;
  error(...args: LogArgs): void;
}

function debugEnabled(tag: string): boolean {
  try {
    const raw = localStorage.getItem("onyxLog");
    if (raw === null) return false;
    const entries = raw.split(",").map((e) => e.trim());
    const match = entries.find((e) => e.split("=")[0] === tag);
    if (match !== undefined) return match.split("=")[1] !== "off";
    return entries.some((e) => e === "*" || e === "*=*");
  } catch {
    return false;
  }
}

export function createLogger(tag: string): Logger {
  const prefix = `[${tag}]`;
  return {
    debug: (...args: LogArgs) => {
      if (debugEnabled(tag)) console.log(prefix, ...args);
    },
    info: (...args: LogArgs) => console.info(prefix, ...args),
    warn: (...args: LogArgs) => console.warn(prefix, ...args),
    error: (...args: LogArgs) => console.error(prefix, ...args),
  };
}
