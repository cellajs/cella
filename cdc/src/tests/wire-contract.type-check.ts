import type { CdcMessage, CdcWorkerHealth } from '#/lib/cdc-websocket';
import type { HealthPush } from '../network/health-reporter';
import type { CdcOutboundMessage } from '../services/api-messages';

/** True when every message of `Sent` is one of the messages of `Accepted`. Distributes over the worker's union. */
type EachConforms<Sent, Accepted> = Sent extends Accepted ? true : false;

type Assert<T extends true> = T;

/**
 * Compile-time CDC-to-backend wire drift guard: a product message must be the backend's `rows` message, and the
 * message of a row that is no product its `rowData` message, each as the API reads it after the parse, its activity
 * included. Incompatible payloads, such as an activity column `createActivity` stops writing, fail `pnpm ts` through
 * `Assert<false>`.
 */
export type CdcConformsToBackendSchema = Assert<EachConforms<CdcOutboundMessage, CdcMessage>>;

/**
 * The health push is graded by the worker and passed on by the API: what the worker sends must be what the API takes.
 * A push the API's `CdcWorkerHealth` does not accept fails `pnpm ts` here.
 */
export type HealthPushConformsToBackend = Assert<HealthPush extends CdcWorkerHealth ? true : false>;
