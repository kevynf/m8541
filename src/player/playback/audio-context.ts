export interface AudioContextLike {
  readonly state: AudioContextState;
  resume(): Promise<void>;
}

const RESUME_TIMEOUT = 1000;
const resuming = new WeakMap<AudioContextLike, Promise<void>>();

export function resumeAudioContext(context: AudioContextLike) {
  if (context.state === "running" || context.state === "closed" || resuming.has(context)) return;
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      resuming.delete(context);
    }
  };
  resuming.set(
    context,
    context
      .resume()
      .catch(() => {})
      .finally(finish),
  );
  setTimeout(finish, RESUME_TIMEOUT);
}
