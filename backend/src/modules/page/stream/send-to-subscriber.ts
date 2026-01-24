import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { writeChange } from '#/sync/stream';
import { buildPublicPageMessage } from './build-message';
import type { PublicPageSubscriber } from './types';

/**
 * Send event to a public subscriber and update cursor.
 */
export async function sendToPublicPageSubscriber(
  subscriber: PublicPageSubscriber,
  event: ActivityEventWithEntity,
): Promise<void> {
  const message = buildPublicPageMessage(event);
  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}
