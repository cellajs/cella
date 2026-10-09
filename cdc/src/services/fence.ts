import { isPlainCountKey } from '#/modules/entities/counter-keys';

/** A `pg_current_snapshot()`: transactions below `xmin` are over, those from `xmax` on had not started, `xip` were running. */
export interface Snapshot {
  xmin: bigint;
  xmax: bigint;
  xip: Set<bigint>;
}

/** Counter deltas per channel key. */
export type CounterDeltas = Map<string, Record<string, number>>;

const XID_RANGE = 1n << 32n;

/** Parses the text form of `pg_current_snapshot()`: `xmin:xmax:xip,xip,...`. */
export function parseSnapshot(text: string): Snapshot {
  const [xmin, xmax, xip = ''] = text.split(':');
  if (!xmin || !xmax) throw new Error(`Not a snapshot: '${text}'`);
  return { xmin: BigInt(xmin), xmax: BigInt(xmax), xip: new Set(xip ? xip.split(',').map((id) => BigInt(id)) : []) };
}

/**
 * Whether a transaction that committed was already visible in a snapshot. The stream gives a transaction's id in 32
 * bits and a snapshot holds 64-bit ids, so the id takes the epoch that puts it nearest to the snapshot's `xmax`.
 * @param xid - The transaction id from its BEGIN message.
 * @param snapshot - The snapshot a count was taken at.
 * @returns True when the count saw the transaction's changes.
 */
export function isVisibleIn(xid: number, snapshot: Snapshot): boolean {
  let full = (snapshot.xmax & ~(XID_RANGE - 1n)) | BigInt(xid >>> 0);
  if (full - snapshot.xmax > XID_RANGE / 2n) full -= XID_RANGE;
  else if (snapshot.xmax - full > XID_RANGE / 2n) full += XID_RANGE;

  if (full < snapshot.xmin) return true;
  if (full >= snapshot.xmax) return false;
  return !snapshot.xip.has(full);
}

/** The plain counts of a set of deltas. */
export function plainCounts(deltas: CounterDeltas): CounterDeltas {
  const counts: CounterDeltas = new Map();
  for (const [channelKey, values] of deltas) {
    const plain = Object.fromEntries(Object.entries(values).filter(([key, value]) => isPlainCountKey(key) && value !== 0));
    if (Object.keys(plain).length) counts.set(channelKey, plain);
  }
  return counts;
}

/** Adds `source` into `target`, key by key. */
export function addCounts(target: CounterDeltas, source: CounterDeltas, sign: 1 | -1 = 1): void {
  for (const [channelKey, values] of source) {
    const into = target.get(channelKey) ?? {};
    for (const [key, value] of Object.entries(values)) into[key] = (into[key] ?? 0) + sign * value;
    target.set(channelKey, into);
  }
}

interface OpenFence {
  mode: 'verify' | 'rebuild';
  snapshot: Snapshot;
  /** Content of the logical message written right after the snapshot. */
  marker: string;
  /** Plain counts of the transactions the count already saw, recorded since the snapshot. */
  counted: CounterDeltas;
  /** True once the stream has passed the snapshot; false when the fence ended before that. */
  passed: Promise<boolean>;
  settle: (passed: boolean) => void;
}

let open: OpenFence | null = null;

/**
 * The fence around a count from the tables. The count is taken at a snapshot while the stream goes on, so until the
 * stream has passed that snapshot some transactions it delivers were already counted. The transaction id says which.
 * A verify adds their plain counts up, to compare with; a rebuild leaves them out of what it applies. The stream has
 * passed the snapshot when the marker arrives: a logical message written right after the snapshot was taken.
 */
export const fence = {
  /** Opens the fence at a snapshot. One fence is open at a time: one still open ends here, without having been passed. */
  open(mode: OpenFence['mode'], snapshotText: string, marker: string): void {
    open?.settle(false);
    let settle: OpenFence['settle'] = () => {};
    const passed = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    open = { mode, snapshot: parseSnapshot(snapshotText), marker, counted: new Map(), passed, settle };
  },

  get mode(): OpenFence['mode'] | null {
    return open?.mode ?? null;
  },

  /** The marker of the open fence, which tells it from a later one; null when none is open. */
  get marker(): string | null {
    return open?.marker ?? null;
  },

  /** Whether the count behind the open fence already saw this transaction. False when no fence is open. */
  sawTransaction(xid: number | undefined): boolean {
    return open !== null && xid !== undefined && isVisibleIn(xid, open.snapshot);
  },

  /** Records plain counts of already counted transactions that a flush has just committed. */
  addCounted(deltas: CounterDeltas): void {
    if (open) addCounts(open.counted, deltas);
  },

  /** Called when a marker message arrives and everything before it is recorded. */
  markerArrived(marker: string): void {
    if (open?.marker === marker) open.settle(true);
  },

  /**
   * Resolves once the open fence is over: true when the stream has passed its snapshot, false when it was closed or
   * another fence took its place before that. False at once when no fence is open.
   */
  whenPassed(): Promise<boolean> {
    return open?.passed ?? Promise.resolve(false);
  },

  /** Closes the fence. @returns The plain counts of the already counted transactions recorded while it was open. */
  close(): CounterDeltas {
    const counted = open?.counted ?? new Map();
    open?.settle(false);
    open = null;
    return counted;
  },
};
