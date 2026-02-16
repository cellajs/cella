/**
 * Public stream subscriber.
 * No authentication required - for public entity updates.
 */
import type { CursoredSubscriber } from '#/sync/stream';

export interface PublicStreamSubscriber extends CursoredSubscriber {}

/**
 * Channel key for public entity subscribers.
 * Format: public:{entityType}
 */
export function publicChannel(entityType: string): string {
  return `public:${entityType}`;
}
