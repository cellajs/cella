import i18n from 'i18next';
import { type TriggerRef, useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { DocsSearch } from '~/modules/docs/search/docs-search';
import { tw } from '~/utils/tw';

/** Fallback focus target when opened via hotkey (no triggering button). */
const hotkeyTriggerRef: TriggerRef = { current: null };

export function openDocsSearch(triggerRef: TriggerRef = hotkeyTriggerRef) {
  return useDialoger.getState().create(<DocsSearch />, {
    id: 'docs-search',
    triggerRef,
    title: i18n.t('c:search'),
    className: tw('mb-4 border-0 p-0 sm:max-w-3xl'),
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
