/**
 * Hybrid Logical Clock (HLC) for causal ordering of concurrent mutations.
 *
 * Format: "1710500000123:0001:abcde"
 *   - Unix millis (physical time)
 *   - 4-digit zero-padded logical counter
 *   - 5-char sourceId hash (deterministic tie-breaking)
 *
 * Lexicographic string comparison gives correct causal ordering.
 */

import { hashSourceId } from 'shared/hash-source-id';

/** Server-side HLC state (module-scoped singleton). */
let lastTimestamp = 0;
let lastCounter = 0;

/**
 * Create a new HLC timestamp.
 * Always advances — never returns a timestamp <= the last one generated.
 */
export function createHLC(now: number, sourceId: string): string {
  if (now > lastTimestamp) {
    lastTimestamp = now;
    lastCounter = 0;
  } else {
    lastCounter++;
  }
  const counter = String(lastCounter).padStart(4, '0');
  return `${lastTimestamp}:${counter}:${hashSourceId(sourceId)}`;
}

/**
 * Compare two HLC timestamps.
 * Lexicographic — works because all segments are fixed-width.
 */
export function compareHLC(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Advance the local clock from an incoming HLC.
 * Ensures server-initiated timestamps are always causally-later
 * than client writes that triggered them.
 */
export function advanceClock(receivedHLC: string): void {
  const parts = receivedHLC.split(':');
  const ts = Number(parts[0]);
  const counter = Number(parts[1]);
  if (ts > lastTimestamp) {
    lastTimestamp = ts;
    lastCounter = counter;
  } else if (ts === lastTimestamp && counter > lastCounter) {
    lastCounter = counter;
  }
}

/** Generate a server HLC (uses Date.now()). */
export function generateServerHLC(sourceId = 'server'): string {
  return createHLC(Date.now(), sourceId);
}

/** Reset HLC state (for testing only). */
export function _resetHLC(): void {
  lastTimestamp = 0;
  lastCounter = 0;
}
