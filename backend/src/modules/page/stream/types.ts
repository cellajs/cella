import type { CursoredSubscriber } from '#/sync/stream';

/**
 * Public page stream subscriber.
 * No authentication required - for public page updates.
 */
export interface PublicPageSubscriber extends CursoredSubscriber {}

/**
 * Channel key for public page subscribers.
 */
export const publicPageChannel = 'public:page';
