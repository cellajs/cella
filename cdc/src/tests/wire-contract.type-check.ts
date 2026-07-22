import type { CdcMessage } from '#/lib/cdc-websocket';
import type { CdcOutboundMessage } from '../services/activity-service';

type ActivityFieldsTolerant<T> = { [K in keyof T]?: T[K] };

type WireConformanceTarget = Omit<CdcMessage, 'activity'> & {
  activity: ActivityFieldsTolerant<CdcMessage['activity']>;
};

type Assert<T extends true> = T;

/**
 * Compile-time CDC-to-backend wire drift guard.
 * Envelope fields are strict, while activity fields tolerate insert optionality filled at runtime.
 * Incompatible payloads fail `pnpm ts` through `Assert<false>`.
 */
export type CdcConformsToBackendSchema = Assert<CdcOutboundMessage extends WireConformanceTarget ? true : false>;
