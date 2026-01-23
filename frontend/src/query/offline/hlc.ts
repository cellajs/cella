import { nanoid } from 'nanoid';

/**
 * Unique identifier for this browser tab/instance.
 * Generated once per page load, used for:
 * - Mutation source tracking (`tx.sourceId`)
 * - "Is this mine?" checks on stream messages
 * - HLC node ID for unique timestamps
 */
export const sourceId = `src_${nanoid()}`;

/**
 * Hybrid Logical Clock implementation for transaction IDs.
 * Provides causality-preserving, lexicographically sortable timestamps.
 *
 * Format: `{wallTime}.{logical}.{nodeId}` (~32 chars)
 *
 * @see https://cse.buffalo.edu/tech-reports/2014-04.pdf
 */
class HybridLogicalClock {
  private lastWallTime = 0;
  private logical = 0;
  private nodeId: string;

  constructor(nodeId: string) {
    this.nodeId = nodeId;
  }

  /**
   * Generate a new HLC timestamp.
   * Guarantees monotonically increasing values even for same-millisecond calls.
   */
  now(): { wallTime: number; logical: number; nodeId: string } {
    const physicalTime = Date.now();

    if (physicalTime > this.lastWallTime) {
      // Time moved forward - reset logical counter
      this.lastWallTime = physicalTime;
      this.logical = 0;
    } else {
      // Same millisecond or clock went backwards - increment logical
      this.logical++;
    }

    return {
      wallTime: this.lastWallTime,
      logical: this.logical,
      nodeId: this.nodeId,
    };
  }

  /**
   * Update clock from received timestamp (for receive events).
   * Ensures local clock is at least as advanced as received.
   */
  receive(receivedWallTime: number, receivedLogical: number): void {
    const localTime = Date.now();
    const maxWallTime = Math.max(localTime, this.lastWallTime, receivedWallTime);

    if (maxWallTime === this.lastWallTime && maxWallTime === receivedWallTime) {
      // All three equal - take max logical + 1
      this.logical = Math.max(this.logical, receivedLogical) + 1;
    } else if (maxWallTime === this.lastWallTime) {
      // Local wall time is max - increment local logical
      this.logical++;
    } else if (maxWallTime === receivedWallTime) {
      // Received wall time is max - use received logical + 1
      this.logical = receivedLogical + 1;
    } else {
      // Physical time is max - reset logical
      this.logical = 0;
    }

    this.lastWallTime = maxWallTime;
  }
}

// Singleton HLC instance per tab
const hlc = new HybridLogicalClock(sourceId);

/**
 * Generate a transaction ID using Hybrid Logical Clock.
 * Format: `{wallTime}.{logical:4}.{nodeId}` (e.g., "1705123456789.0000.src_abc123")
 */
export function createTransactionId(): string {
  const ts = hlc.now();
  const logical = String(ts.logical).padStart(4, '0');
  return `${ts.wallTime}.${logical}.${ts.nodeId}`;
}

/**
 * Parse a transaction ID back into components.
 */
export function parseTransactionId(txId: string): {
  wallTime: number;
  logical: number;
  nodeId: string;
} {
  const [wallTime, logical, nodeId] = txId.split('.');
  return {
    wallTime: Number(wallTime),
    logical: Number(logical),
    nodeId,
  };
}

/**
 * Compare two transaction IDs.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Lexicographic comparison works due to HLC format.
 */
export function compareTransactionIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Update local clock from received transaction ID.
 * Call this when receiving stream messages to maintain causality.
 */
export function receiveTransactionId(txId: string): void {
  const { wallTime, logical } = parseTransactionId(txId);
  hlc.receive(wallTime, logical);
}
