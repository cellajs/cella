import { Suspense } from 'react';
import { type TriggerRef, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { Spinner } from '~/modules/common/spinner';
import { lazyNamed } from '~/utils/lazy-named';

// Lazy: the dialog (and the search engine it pulls in) loads on first open only.
const LazyDocsSearch = lazyNamed(() => import('~/modules/docs/search/docs-search'), 'DocsSearch');

/** Fallback focus target when opened via hotkey (no triggering button). */
const hotkeyTriggerRef: TriggerRef = { current: null };

export function openDocsSearch(triggerRef: TriggerRef = hotkeyTriggerRef) {
  return useDialoger.getState().create(
    <Suspense
      fallback={
        <div className="flex h-24 items-center justify-center">
          <Spinner />
        </div>
      }
    >
      <LazyDocsSearch />
    </Suspense>,
    {
      id: 'docs-search',
      triggerRef,
      className: 'sm:max-w-2xl p-0 border-0 mb-4',
      headerClassName: 'hidden',
      drawerOnMobile: false,
    },
  );
}

/** Hotkey handler: ⌘K/Ctrl-K toggles the dialog. */
export function toggleDocsSearch() {
  const dialoger = useDialoger.getState();
  if (dialoger.get('docs-search')) dialoger.remove('docs-search');
  else openDocsSearch();
}
