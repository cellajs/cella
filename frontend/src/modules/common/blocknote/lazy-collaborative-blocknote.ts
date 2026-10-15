import { lazyNamed } from '~/utils/lazy-named';

/**
 * The collaborative editor behind a lazy import. A module grouped into a boot chunk (any module folder an app registers at
 * startup) that imports `CollaborativeBlockNote` statically pulls BlockNote, Uppy and Yjs into startup. Render it under a `Suspense`.
 */
export const LazyCollaborativeBlockNote = lazyNamed(() => import('~/modules/common/blocknote/collaborative-blocknote'), 'CollaborativeBlockNote');
