import type { BaseStreamSubscriber } from '#/sync/stream';

/**
 * Public page stream subscriber.
 * No authentication required - for public page updates.
 */
export interface PublicPageSubscriber extends BaseStreamSubscriber {
  /** Last activity ID cursor (skip activities <= cursor) */
  cursor: string | null;
}

/**
 * Index key for public page subscribers.
 */
export const publicPageIndexKey = 'public:page';
