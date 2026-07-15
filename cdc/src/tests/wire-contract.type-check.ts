import type { CdcMessage } from '#/lib/cdc-websocket';
import type { CdcOutboundMessage } from '../services/activity-service';

type ActivityFieldsTolerant<T> = { [K in keyof T]?: T[K] };

type WireConformanceTarget = Omit<CdcMessage, 'activity'> & {
  activity: ActivityFieldsTolerant<CdcMessage['activity']>;
};

type Assert<T extends true> = T;

/**
 * Compile-time drift guard for the CDC → API-server wire contract (see
 * .info/wire-contract-and-stream-split-options.md, Part A, option A1).
 * Envelope fields (rowData, cacheToken, batchReservations, _trace) are checked strictly.
 * The activity sub-shape is checked with tolerance for insert-optionality (nullable
 * columns are `T?`), since both sides co-derive it from `activitiesTable` and
 * `createActivity` fills those at runtime. Type-only: compiled by `pnpm ts`, not run by vitest.
 * If CDC's payload stops satisfying the backend's validated shape, the conditional yields
 * `false` and `Assert<false>` fails to compile, surfacing the drift here.
 */
export type CdcConformsToBackendSchema = Assert<CdcOutboundMessage extends WireConformanceTarget ? true : false>;
