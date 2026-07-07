import type { CdcMessage } from '#/lib/cdc-websocket';
import type { CdcOutboundMessage } from '../services/activity-service';

/**
 * Compile-time drift guard for the CDC → API-server wire contract.
 * See .info/wire-contract-and-stream-split-options.md (Part A, option A1).
 *
 * Asserts that what the CDC worker *produces* (`CdcOutboundMessage`) satisfies what
 * the backend *validates* (`CdcMessage`, inferred from `cdcMessageSchema`).
 *
 * - Envelope fields (`rowData`, `cacheToken`, `batchReservations`, `_trace`) are the
 *   hand-written part of the contract and are checked strictly: renaming, removing,
 *   or retyping any of them on one side without the other fails this build.
 * - The `activity` sub-shape is checked with tolerance. Both ends co-derive it from
 *   `activitiesTable` (CDC via `InsertActivityModel`, backend via `createSelectSchema`),
 *   so it cannot drift independently; the only static difference is drizzle
 *   insert-optionality (nullable columns are `T?`), which `createActivity` always
 *   fills at runtime. Tolerating that keeps the guard honest without a false positive.
 *
 * Type-only: compiled by `pnpm ts`, not run by vitest (which only picks up `*.test.ts`).
 */
type ActivityFieldsTolerant<T> = { [K in keyof T]?: T[K] | undefined };

type WireConformanceTarget = Omit<CdcMessage, 'activity'> & {
  activity: ActivityFieldsTolerant<CdcMessage['activity']>;
};

type Assert<T extends true> = T;

// If CDC's payload stops satisfying the backend's validated shape, the conditional
// yields `false` and `Assert<false>` fails to compile — surfacing the drift here.
export type CdcConformsToBackendSchema = Assert<CdcOutboundMessage extends WireConformanceTarget ? true : false>;
