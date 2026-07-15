import { lazyNamed } from '~/utils/lazy-named';

/**
 * A single shared lazy instance so preloading (e.g. usePreloadLazyComponents on board mount) resolves the
 * same wrapper every consumer uses, eliminating the Suspense spinner flash.
 */
export const BlockNoteFullHtml = lazyNamed(() => import('~/modules/common/blocknote/full-html'), 'BlockNoteFullHtml');
