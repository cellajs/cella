import type { Pgoutput } from 'pg-logical-replication';

/**
 * When the transaction of a BEGIN message committed, in Unix milliseconds. Postgres sends microseconds since
 * 2000-01-01; the replication client has already moved them to the Unix epoch.
 */
export const commitTimeMs = (msg: Pgoutput.MessageBegin): number | null => (msg.commitTime ? Number(msg.commitTime.valueOf() / 1000n) : null);
