import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import type { RefObject } from 'react';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { AppSearch } from '~/modules/navigation/app-search';
import { tw } from '~/utils/tw';

export function startSearchAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  if (!onlineManager.isOnline()) return toaster.warning(i18n.t('c:action.offline.text'));

  return useDialoger.getState().create(<AppSearch />, {
    id: 'search',
    triggerRef,
    title: i18n.t('c:search'),
    className: tw('mb-4 border-0 p-0 sm:max-w-2xl'),
    headerClassName: 'hidden',
    drawerOnMobile: false,
  });
}
