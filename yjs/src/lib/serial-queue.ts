/** One ordered pipeline: tasks run one at a time in enqueue order; a failing task reports and does not block the next. */
export interface SerialQueue {
  /** Resolves once the task has run (or was skipped because the queue closed). Never rejects. */
  enqueue(task: () => Promise<void> | void): Promise<void>;
  /** Drops every task not yet started; running tasks finish. */
  close(): void;
  /** Tasks waiting to run. */
  readonly size: number;
  readonly closed: boolean;
}

export function createSerialQueue(onError: (err: unknown) => void = () => {}): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let waiting = 0;
  let closed = false;

  return {
    enqueue(task) {
      if (closed) return Promise.resolve();
      waiting++;
      const run = tail.then(async () => {
        waiting--;
        if (closed) return;
        try {
          await task();
        } catch (err) {
          onError(err);
        }
      });
      tail = run;
      return run;
    },
    close() {
      closed = true;
    },
    get size() {
      return waiting;
    },
    get closed() {
      return closed;
    },
  };
}
