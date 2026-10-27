import i18n from 'i18next';
import { dialoger, type TriggerRef } from '~/modules/common/dialoger/use-dialoger';
import { DocsSearch, docsSearchDialogId } from '~/modules/docs/search/docs-search';
import { tw } from '~/utils/tw';

/** Fallback focus target when opened via hotkey (no triggering button). */
const hotkeyTriggerRef: TriggerRef = { current: null };

export function openDocsSearch(triggerRef: TriggerRef = hotkeyTriggerRef) {
  return dialoger.getState().create(<DocsSearch />, {
    id: docsSearchDialogId,
    triggerRef,
    title: i18n.t('c:search'),
    className: tw('mb-4 border-0 p-0 shadow-floating sm:max-w-3xl'),
    headerClassName: 'hidden',
    drawerOnMobile: false,
    searchLayout: true,
  });
}

/** Hotkey handler: ⌘K/Ctrl-K toggles the dialog. */
export function toggleDocsSearch() {
  if (dialoger.getState().get(docsSearchDialogId)) dialoger.getState().remove(docsSearchDialogId);
  else openDocsSearch();
}
