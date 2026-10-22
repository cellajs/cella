import { type AnyPgTable, PgTimestampString, PgTimestampStringBuilder } from 'drizzle-orm/pg-core';

/**
 * The driver's text for a timestamp: `2026-10-22 10:00:00.123+00` from `timestamptz`, `2026-10-22 10:00:00.123` from a
 * column without a zone, which holds UTC because every connection runs in UTC. The fraction may run to microseconds.
 */
const driverTimestamp = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/;

/** The one timestamp text of the app, UTC to the millisecond: `2026-10-22T10:00:00.123Z`. Driver text and ISO text both parse. */
export const toIsoTimestamp = (value: string): string => {
  const match = driverTimestamp.exec(value);
  if (!match) return new Date(value).toISOString();
  const [, date, time, fraction = '', hours, minutes = '00'] = match;
  const zone = hours ? `${hours}:${minutes}` : 'Z';
  return new Date(`${date}T${time}.${fraction.padEnd(3, '0').slice(0, 3)}${zone}`).toISOString();
};

/** Drizzle's string mode hands the driver text through; this column hands out {@link toIsoTimestamp} text. */
class IsoTimestampString extends PgTimestampString {
  override mapFromDriverValue = toIsoTimestamp;
}

class IsoTimestampStringBuilder extends PgTimestampStringBuilder {
  /** @internal Drizzle calls it when a table builds its columns. */
  build(table: AnyPgTable) {
    return new IsoTimestampString(table, this.config);
  }
}

/** A moment in time: `timestamptz` in Postgres, ISO UTC text ({@link toIsoTimestamp}) on both sides of the driver. */
export const isoTimestamp = () => new IsoTimestampStringBuilder('', true, undefined);

/**
 * The same text over a `timestamp` column without a zone, for the three partition keys (`activities`, `notifications`,
 * `seen_by`): Postgres cannot retype a partition key. Every connection runs in UTC, so the stored wall time is UTC.
 */
export const isoTimestampWithoutZone = () => new IsoTimestampStringBuilder('', false, undefined);

/** The stamps of rows without a writer (sessions, tokens, proofs); rows with a writer spread `auditColumns()`. */
export const timestampColumns = {
  createdAt: isoTimestamp().defaultNow().notNull(),
  updatedAt: isoTimestamp(),
  expiresAt: isoTimestamp().notNull(),
};
