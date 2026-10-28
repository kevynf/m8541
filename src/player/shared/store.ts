export type Unsubscribe = () => void;

export type Subscriber<T> = (value: T) => void;

export type ReadableStore<T> = {
  subscribe(run: Subscriber<T>): Unsubscribe;
  get(): T;
};

export type Store<T> = ReadableStore<T> & {
  set(next: T): void;
  update(updater: (value: T) => T): void;
};

export type StoreReader<T> = {
  subscribe(run: Subscriber<T>): Unsubscribe;
  get?(): T;
};

export type StoreStarter<T> = (set: (next: T) => void) => Unsubscribe | undefined;

export function createStore<T>(initialValue: T, start?: StoreStarter<T>): Store<T> {
  let value = initialValue;
  let stop: Unsubscribe | undefined;
  const subscribers = new Set<Subscriber<T>>();

  function subscribe(run: Subscriber<T>): Unsubscribe {
    subscribers.add(run);
    run(value);
    if (subscribers.size === 1 && start) {
      stop = start(set) ?? undefined;
    }
    return () => {
      subscribers.delete(run);
      if (subscribers.size === 0) {
        stop?.();
        stop = undefined;
      }
    };
  }

  function set(next: T) {
    if (Object.is(next, value)) return;
    value = next;
    for (const run of [...subscribers]) run(value);
  }

  function update(updater: (value: T) => T) {
    set(updater(value));
  }

  return { subscribe, set, update, get: () => value };
}

export function getStore<T>(store: StoreReader<T>): T {
  if (typeof store.get === "function") return store.get();
  let value: T | undefined;
  const unsubscribe = store.subscribe((next) => {
    value = next;
  });
  unsubscribe();
  return value as T;
}

export function subscribeStore<T>(
  store: StoreReader<T> | null | undefined,
  ...subscribers: Subscriber<T>[]
): Unsubscribe {
  if (store == null) {
    for (const subscriber of subscribers) subscriber(undefined as T);
    return () => {};
  }
  return store.subscribe(...(subscribers as [Subscriber<T>]));
}
