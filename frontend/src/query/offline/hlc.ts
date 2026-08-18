import { hashSourceId } from 'shared/utils/hash-source-id';
import { uuidv7 } from 'uuidv7';

/** Unique per browser tab, generated once per page load: carried as `stx.sourceId` and compared for echo checks on stream notifications. */
export const sourceId = uuidv7();

let lastTimestamp = 0;
let lastCounter = 0;

// 5-char hash of sourceId, for compact HLC strings.
const sourceHash = hashSourceId(sourceId);

/** Format `millis:counter:source`; lexicographic comparison gives causal ordering. */
export function createHLC(): string {
  const now = Date.now();
  if (now > lastTimestamp) {
    lastTimestamp = now;
    lastCounter = 0;
  } else {
    lastCounter++;
  }
  const ts = String(lastTimestamp);
  const cnt = String(lastCounter).padStart(4, '0');
  return `${ts}:${cnt}:${sourceHash}`;
}

/** Every field of one mutation shares a single HLC, making the update atomic. */
export function createFieldTimestamps(fieldNames: string[]): Record<string, string> {
  if (fieldNames.length === 0) return {};
  const hlc = createHLC();
  const timestamps: Record<string, string> = {};
  for (const name of fieldNames) {
    timestamps[name] = hlc;
  }
  return timestamps;
}
