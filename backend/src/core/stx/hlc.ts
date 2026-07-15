import { hashSourceId } from 'shared/utils/hash-source-id';

const hlcPattern = /^(\d+):(\d{4,}):([0-9a-z]{5})$/;

/** Parsed components of a wire-format HLC timestamp. */
export interface ParsedHLC {
  timestamp: bigint;
  counter: bigint;
  source: string;
}

/** Server-side HLC state (module-scoped singleton). */
let lastTimestamp = 0n;
let lastCounter = 0n;

/** Parse `millis:counter:sourceHash`, returning `null` for malformed input. */
export function parseHLC(value: string): ParsedHLC | null {
  const match = hlcPattern.exec(value);
  if (!match) return null;
  return {
    timestamp: BigInt(match[1]),
    counter: BigInt(match[2]),
    source: match[3],
  };
}

/** Whether a string uses the canonical HLC wire format. */
export function isValidHLC(value: string): boolean {
  return parseHLC(value) !== null;
}

function requireHLC(value: string): ParsedHLC {
  const parsed = parseHLC(value);
  if (!parsed) throw new TypeError(`Invalid HLC timestamp: "${value}"`);
  return parsed;
}

/**
 * Create a new HLC timestamp.
 * Advances beyond the last generated timestamp.
 */
export function createHLC(now: number, sourceId: string): string {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError(`Invalid HLC time: ${now}`);
  const timestamp = BigInt(now);
  if (timestamp > lastTimestamp) {
    lastTimestamp = timestamp;
    lastCounter = 0n;
  } else {
    lastCounter++;
  }
  const counter = String(lastCounter).padStart(4, '0');
  return `${lastTimestamp}:${counter}:${hashSourceId(sourceId)}`;
}

/**
 * Compare two valid HLC timestamps by millis, counter, then source hash.
 * Throws when either timestamp is malformed.
 */
export function compareHLC(a: string, b: string): -1 | 0 | 1 {
  const left = requireHLC(a);
  const right = requireHLC(b);
  if (left.timestamp !== right.timestamp) return left.timestamp < right.timestamp ? -1 : 1;
  if (left.counter !== right.counter) return left.counter < right.counter ? -1 : 1;
  if (left.source < right.source) return -1;
  if (left.source > right.source) return 1;
  return 0;
}

/**
 * Advance the local clock from an incoming HLC.
 * Keeps server-initiated timestamps causally later than triggering client writes.
 */
export function advanceClock(receivedHLC: string): void {
  const { timestamp, counter } = requireHLC(receivedHLC);
  if (timestamp > lastTimestamp) {
    lastTimestamp = timestamp;
    lastCounter = counter;
  } else if (timestamp === lastTimestamp && counter > lastCounter) {
    lastCounter = counter;
  }
}

/** Generate a server HLC (uses Date.now()). */
export function generateServerHLC(sourceId = 'server'): string {
  return createHLC(Date.now(), sourceId);
}

/** Reset HLC state (for testing only). */
export function _resetHLC(): void {
  lastTimestamp = 0n;
  lastCounter = 0n;
}
