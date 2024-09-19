import { queryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getMembers } from '~/api/general';
import { getOrganization } from '~/api/organizations';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/taosts-show';
import { Switch } from '~/modules/ui/switch';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const NetworkModeSwitch = () => {
  const { t } = useTranslation();
  const { networkMode, setNetworkMode } = useUserStore();
  const { menu } = useNavigationStore();

  useEffect(() => {
    if (networkMode === 'online') return;

    for (const section of Object.values(menu)) {
      for (const item of section) {
        if (item.entity === 'organization') {
          queryClient.ensureQueryData(
            queryOptions({
              queryKey: ['organizations', item.id],
              queryFn: () => getOrganization(item.id),
            }),
          );
          queryClient.ensureQueryData(
            queryOptions({
              queryKey: ['members', item.id, item.entity],
              queryFn: async () =>
                getMembers({
                  idOrSlug: item.id,
                  entityType: item.entity,
                }),
            }),
          );
        }
      }
    }
  }, [networkMode]);

  const onCheckedChange = (mode: boolean) => {
    showToast(t(`common:offline_mode_${mode ? 'off' : 'on'}.text`, { appName: config.name }), 'info');
    setNetworkMode(mode ? 'offline' : 'online');
  };

  return (
    <div className="flex items-center gap-4 ml-1">
      <Switch
        size="xs"
        id="offlineMode"
        checked={networkMode === 'offline'}
        onCheckedChange={onCheckedChange}
        aria-label={t('common:keep_menu_open')}
      />
      <label htmlFor="offlineMode" className="cursor-pointer select-none text-sm font-medium leading-none">
        {t('common:offline_mode')}
      </label>
    </div>
  );
};
