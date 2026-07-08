import { hashSourceId } from 'shared/hash-source-id';

/** Server-side HLC state (module-scoped singleton). */
let lastTimestamp = 0;
let lastCounter = 0;

/**
 * Create a new HLC timestamp.
 * Advances beyond the last generated timestamp.
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
 * Lexicographic comparison is valid because all segments are fixed-width.
 */
export function compareHLC(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Advance the local clock from an incoming HLC.
 * Keeps server-initiated timestamps causally later than triggering client writes.
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
