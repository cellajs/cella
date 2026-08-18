import { lazyNamed } from '~/utils/lazy-named';

/** One shared lazy instance so preloading resolves the same wrapper every consumer uses, avoiding a Suspense spinner flash. */
export const BlockNoteFullHtml = lazyNamed(() => import('~/modules/common/blocknote/full-html'), 'BlockNoteFullHtml');
