import type { CdcMessage, CdcWorkerHealth } from '#/lib/cdc-websocket';
import type { HealthPush } from '../network/health-reporter';
import type { CdcOutboundMessage } from '../services/activity-service';

type ActivityFieldsTolerant<T> = { [K in keyof T]?: T[K] };

/** Each message the backend accepts, with its activity fields made optional. Distributes over the schema's union. */
type WireConformanceTarget<M = CdcMessage> = M extends { activity: infer A } ? Omit<M, 'activity'> & { activity: ActivityFieldsTolerant<A> } : never;

/** True when every message of `Sent` is one of the messages of `Accepted`. Distributes over the worker's union. */
type EachConforms<Sent, Accepted> = Sent extends Accepted ? true : false;

type Assert<T extends true> = T;

/**
 * Compile-time CDC-to-backend wire drift guard: a product message must be the backend's `rows` message, and the
 * message of a row that is no product its `rowData` message. Envelope fields are strict, while activity fields
 * tolerate insert optionality filled at runtime. Incompatible payloads fail `pnpm ts` through `Assert<false>`.
 */
export type CdcConformsToBackendSchema = Assert<EachConforms<CdcOutboundMessage, WireConformanceTarget>>;

/**
 * The health push is graded by the worker and passed on by the API: what the worker sends must be what the API takes.
 * A push the API's `CdcWorkerHealth` does not accept fails `pnpm ts` here.
 */
export type HealthPushConformsToBackend = Assert<HealthPush extends CdcWorkerHealth ? true : false>;
