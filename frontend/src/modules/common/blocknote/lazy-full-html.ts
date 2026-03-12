import { lazy } from 'react';

/**
 * Shared React.lazy wrapper for BlockNoteFullHtml.
 *
 * Using a single lazy instance ensures that preloading the component
 * (e.g. via usePreloadLazyComponents on board mount) resolves the same
 * wrapper used by every consumer, eliminating the Suspense spinner flash.
 */
export const BlockNoteFullHtml = lazy(() => import('~/modules/common/blocknote/full-html'));
