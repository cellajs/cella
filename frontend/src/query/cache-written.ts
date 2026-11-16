type Wait = { promise: Promise<void>; settle: () => void };

/** The wait for the write that takes the cache changes noted so far; null when no change waits for a write. */
let unwritten: Wait | null = null;
/** The cache write under way. */
let writing: Promise<void> | null = null;

/** The persister notes a cache change that waits for its write. */
export function noteCacheChange(): void {
  if (unwritten) return;
  let settle = () => {};
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  unwritten = { promise, settle };
}

/**
 * The persister runs each cache write through this. `write` takes the cache as it stands before its first await: a
 * change noted while it runs waits for a later write.
 */
export function trackCacheWrite(write: () => Promise<void>): Promise<void> {
  const taken = unwritten;
  unwritten = null;
  const run = write().finally(() => {
    if (writing === run) writing = null;
    taken?.settle();
  });
  writing = run;
  return run;
}

/** Settles once the write that takes the cache as it stands has ended, stored or not; at once when no change waits and none runs. */
export function whenCacheWritten(): Promise<void> {
  return unwritten?.promise ?? writing ?? Promise.resolve();
}
