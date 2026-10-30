import { hashSourceId } from 'shared/utils/hash-source-id';

/**
 * `millis:counter:sourceHash`: millis of up to 16 digits, a counter of 4 to 10 and a 5-character hash. `BigInt` parses
 * the digits, so the bound caps what a request stamp costs and what every later server stamp prints.
 */
const hlcPattern = /^(\d{1,16}):(\d{4,10}):([0-9a-z]{5})$/;

/** The longest string hlcPattern takes. */
export const hlcMaxLength = 33;

/** The largest counter hlcPattern takes: a server stamp at it moves to the next millisecond. */
const maxCounter = 9_999_999_999n;

/**
 * How far ahead of the server's wall clock a stamp's millis may lie and still count. A stamp beyond it moves no clock and
 * loses to the next write of its field, so one request cannot set the order of every later write on the process.
 */
export const maxClockSkewMs = 60_000;

interface ParsedHLC {
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
  return { timestamp: BigInt(match[1]), counter: BigInt(match[2]), source: match[3] };
}

/** Whether `value` is an HLC in the `millis:counter:sourceHash` form. */
export function isValidHLC(value: string): boolean {
  return parseHLC(value) !== null;
}

const beyondClockSkew = ({ timestamp }: ParsedHLC) => timestamp > BigInt(Date.now() + maxClockSkewMs);

/** Whether `value` is an HLC whose millis lie more than `maxClockSkewMs` ahead of the wall clock. */
export function isBeyondClockSkew(value: string): boolean {
  const parsed = parseHLC(value);
  return parsed !== null && beyondClockSkew(parsed);
}

function requireHLC(value: string): ParsedHLC {
  const parsed = parseHLC(value);
  if (!parsed) throw new TypeError(`Invalid HLC timestamp: "${value}"`);
  return parsed;
}

/** Advances beyond the last generated timestamp. */
function createHLC(now: number, sourceId: string): string {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError(`Invalid HLC time: ${now}`);
  const timestamp = BigInt(now);
  if (timestamp > lastTimestamp) {
    lastTimestamp = timestamp;
    lastCounter = 0n;
  } else if (lastCounter >= maxCounter) {
    lastTimestamp++;
    lastCounter = 0n;
  } else {
    lastCounter++;
  }
  const counter = String(lastCounter).padStart(4, '0');
  return `${lastTimestamp}:${counter}:${hashSourceId(sourceId)}`;
}

/** Compares by millis, counter, then source hash. Throws when either timestamp is malformed. */
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
 * Keeps server-initiated timestamps causally later than the client writes that trigger them. A stamp outside the HLC
 * form or beyond `maxClockSkewMs` moves nothing: a row may still store one, and the clock it set would reach every later
 * write on the process.
 */
export function advanceClock(receivedHLC: string): void {
  const parsed = parseHLC(receivedHLC);
  if (!parsed || beyondClockSkew(parsed)) return;
  const { timestamp, counter } = parsed;
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
