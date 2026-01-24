import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { writeChange } from '#/sync/stream';
import { buildStreamMessage } from './build-message';
import type { OrgStreamSubscriber } from './types';

/**
 * Send event to a subscriber and update cursor.
 */
export async function sendToOrgSubscriber(
  subscriber: OrgStreamSubscriber,
  event: ActivityEventWithEntity,
): Promise<void> {
  const message = buildStreamMessage(event);

  await writeChange(subscriber.stream, event.id, message);

  // Update cursor
  subscriber.cursor = event.id;
}
