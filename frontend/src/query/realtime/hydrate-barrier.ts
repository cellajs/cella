import { useCallback, useEffect, useRef } from 'react';

/**
 * A hydrate barrier that queues items during hydration phase.
 * Used to prevent race conditions between stream messages and initial queries.
 */
export interface HydrateBarrier<T> {
  /** Queue an item if still hydrating. Returns true if queued, false if processed immediately. */
  enqueue: (item: T) => boolean;
  /** Mark hydration complete and return all queued items. */
  complete: () => T[];
  /** Check if currently in hydration phase. */
  isHydrating: () => boolean;
  /** Reset barrier to hydrating state (clears queue). */
  reset: () => void;
}

/**
 * Creates a hydrate barrier that queues items during hydration phase.
 * Items are held until `complete()` is called, then returned for processing.
 *
 * @example
 * ```ts
 * const barrier = createHydrateBarrier<StreamMessage>();
 *
 * // During hydration, messages are queued
 * barrier.enqueue(message1); // returns true (queued)
 * barrier.enqueue(message2); // returns true (queued)
 *
 * // When hydration completes, flush the queue
 * const queued = barrier.complete(); // returns [message1, message2]
 *
 * // After completion, messages pass through
 * barrier.enqueue(message3); // returns false (not queued, process immediately)
 * ```
 */
export function createHydrateBarrier<T>(): HydrateBarrier<T> {
  let hydrating = true;
  let queue: T[] = [];

  return {
    enqueue: (item: T): boolean => {
      if (!hydrating) return false;
      queue.push(item);
      return true;
    },

    complete: (): T[] => {
      hydrating = false;
      const items = queue;
      queue = [];
      return items;
    },

    isHydrating: () => hydrating,

    reset: () => {
      hydrating = true;
      queue = [];
    },
  };
}

/** Options for useHydrateBarrier hook. */
export interface UseHydrateBarrierOptions<T> {
  /** Callback to process each queued item on flush. */
  onFlush: (item: T) => void;
  /** Whether hydration is complete. When true, queued items are flushed. */
  isHydrated?: boolean;
}

/** Return value from useHydrateBarrier hook. */
export interface UseHydrateBarrierReturn<T> {
  /** The barrier instance for queuing items. */
  barrier: HydrateBarrier<T>;
  /** Manually flush all queued items. */
  flush: () => void;
}

/**
 * Hook that creates a hydrate barrier and manages its lifecycle.
 * Automatically flushes queued items when `isHydrated` becomes true.
 *
 * @example
 * ```tsx
 * const { barrier } = useHydrateBarrier({
 *   onFlush: (message) => processMessage(message),
 *   isHydrated: !isFetching,
 * });
 *
 * // In message handler:
 * if (barrier.enqueue(message)) {
 *   console.debug('Message queued during hydration');
 *   return;
 * }
 * processMessage(message);
 * ```
 */
export function useHydrateBarrier<T>(options: UseHydrateBarrierOptions<T>): UseHydrateBarrierReturn<T> {
  const { isHydrated = true } = options;

  const barrierRef = useRef(createHydrateBarrier<T>());
  const onFlushRef = useRef(options.onFlush);
  onFlushRef.current = options.onFlush;

  const flush = useCallback(() => {
    const items = barrierRef.current.complete();
    if (items.length > 0) {
      console.debug(`[HydrateBarrier] Flushing ${items.length} queued items`);
      for (const item of items) {
        onFlushRef.current(item);
      }
    }
  }, []);

  // Auto-flush when isHydrated becomes true
  useEffect(() => {
    if (isHydrated && barrierRef.current.isHydrating()) {
      flush();
    }
  }, [isHydrated, flush]);

  return { barrier: barrierRef.current, flush };
}
