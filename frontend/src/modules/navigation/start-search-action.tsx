import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import type { RefObject } from 'react';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/toaster';
import { AppSearch } from '~/modules/navigation/app-search';

export function startSearchAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  if (!onlineManager.isOnline()) return toaster.warning(i18n.t('c:action.offline.text'));

  return useDialoger.getState().create(<AppSearch />, {
    id: 'search',
    triggerRef,
    className: 'sm:max-w-2xl p-0 border-0 mb-4',
    headerClassName: 'hidden',
    drawerOnMobile: false,
  });
}
