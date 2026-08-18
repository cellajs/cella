import { type TriggerRef, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { DocsSearch } from '~/modules/docs/search/docs-search';

/** Fallback focus target when opened via hotkey (no triggering button). */
const hotkeyTriggerRef: TriggerRef = { current: null };

export function openDocsSearch(triggerRef: TriggerRef = hotkeyTriggerRef) {
  return useDialoger.getState().create(<DocsSearch />, {
    id: 'docs-search',
    triggerRef,
    className: 'sm:max-w-3xl p-0 border-0 mb-4',
    headerClassName: 'hidden',
    drawerOnMobile: false,
  });
}

/** Hotkey handler: ⌘K/Ctrl-K toggles the dialog. */
export function toggleDocsSearch() {
  const dialoger = useDialoger.getState();
  if (dialoger.get('docs-search')) dialoger.remove('docs-search');
  else openDocsSearch();
}
