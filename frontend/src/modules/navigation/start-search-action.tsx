import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import type { RefObject } from 'react';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { AppSearch } from '~/modules/navigation/app-search';
import { tw } from '~/utils/tw';

export function startSearchAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  if (!onlineManager.isOnline()) return toastOffline();

  return dialoger.getState().create(<AppSearch />, {
    id: 'search',
    triggerRef,
    title: i18n.t('c:search'),
    className: tw('mb-4 border-0 p-0 shadow-floating sm:max-w-2xl'),
    headerClassName: 'hidden',
    drawerOnMobile: false,
    searchLayout: true,
  });
}
