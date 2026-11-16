import { formatHlc } from 'shared/utils/hlc';
import { uuidv7 } from 'uuidv7';

/** Unique per browser tab, generated once per page load: carried as `stx.sourceId` and compared for echo checks on stream changes. */
export const sourceId = uuidv7();

let lastTimestamp = 0;
let lastCounter = 0;

/** Format `millis:counter:source`; lexicographic comparison gives causal ordering. */
function createHLC(): string {
  const now = Date.now();
  if (now > lastTimestamp) {
    lastTimestamp = now;
    lastCounter = 0;
  } else {
    lastCounter++;
  }
  return formatHlc(lastTimestamp, lastCounter, sourceId);
}

/** Every field of one mutation shares a single HLC, making the update atomic. */
export function createFieldTimestamps(fieldNames: string[]): Record<string, string> {
  if (fieldNames.length === 0) return {};
  const hlc = createHLC();
  return Object.fromEntries(fieldNames.map((name) => [name, hlc]));
}
