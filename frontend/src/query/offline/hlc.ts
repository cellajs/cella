import { hashSourceId } from 'shared/utils/hash-source-id';
import { uuidv7 } from 'uuidv7';

/**
 * Unique id for this browser tab, generated once per page load. Used for mutation source tracking
 * (`stx.sourceId`) and "is this mine?" echo checks on stream notifications.
 */
export const sourceId = uuidv7();

// Module-scoped state: one clock per tab.
let lastTimestamp = 0;
let lastCounter = 0;

// Derive 5-char hash from sourceId for compact HLC strings
const sourceHash = hashSourceId(sourceId);

/**
 * Create an HLC string for this tab.
 * Format: "millis:counter:source"; lexicographic comparison gives causal ordering.
 */
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

/**
 * Generate HLC timestamps for a set of field names.
 * All fields in a single mutation get the same HLC (atomic update).
 */
export function createFieldTimestamps(fieldNames: string[]): Record<string, string> {
  if (fieldNames.length === 0) return {};
  const hlc = createHLC();
  const timestamps: Record<string, string> = {};
  for (const name of fieldNames) {
    timestamps[name] = hlc;
  }
  return timestamps;
}
