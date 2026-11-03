import type { ChannelIdColumns } from 'shared';
import type { ProductActivityEvent } from '#/lib/activity-bus';

/** A product event routed via the app (authenticated) stream as changes, its organization present. */
export type AppStreamProductEvent = ProductActivityEvent & { organizationId: string } & Partial<ChannelIdColumns>;
