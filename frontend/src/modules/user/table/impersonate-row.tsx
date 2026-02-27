import i18n from 'i18next';
import { VenetianMaskIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { startImpersonation } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMe } from '~/modules/me/helpers';
import { meKeys } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { Button } from '~/modules/ui/button';
import type { BaseUser } from '~/modules/user/types';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';
import router from '~/routes/router';
import { useUIStore } from '~/store/ui';

interface Props {
  user: BaseUser;
  tabIndex: number;
}

async function handleStartImpersonation(targetUserId: string) {
  try {
    await startImpersonation({ query: { targetUserId } });
    useUIStore.getState().setImpersonating(true);
    // Remove stale user and membership caches so fresh data is fetched for the impersonated user
    queryClient.removeQueries({ queryKey: meKeys.all });
    queryClient.removeQueries({ queryKey: meKeys.memberships });
    await getAndSetMe();
    await getMenuData();
    // Reconnect SSE so the subscriber uses the impersonated user's role and memberships
    appStreamManager.reconnect();
    toaster(i18n.t('common:success.impersonated'), 'success');
    router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
  } catch (error) {
    toaster(i18n.t('error:impersonation_failed'), 'error');
    console.error(error);
  }
}

export function ImpersonateRow({ user, tabIndex }: Props) {
  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:impersonate')}
      onClick={() => handleStartImpersonation(user.id)}
    >
      <VenetianMaskIcon size={16} />
    </Button>
  );
}
