import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/service';
import { Switch } from '~/modules/ui/switch';
import { useUIStore } from '~/store/ui';

export const OfflineAccessSwitch = () => {
  const { t } = useTranslation();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();

  const onCheckedChange = (isOffline: boolean) => {
    // setTimeout is used to show the toast after the switch is toggled (QueryProvider updates)
    setTimeout(() => {
      toaster(t(`common:offline_access_${isOffline ? 'on' : 'off'}.text`, { appName: appConfig.name }), 'info');
    }, 0);

    toggleOfflineAccess();
  };

  return (
    <div className="flex items-center gap-4 px-4">
      <Switch
        id="offlineMode"
        checked={offlineAccess}
        onCheckedChange={onCheckedChange}
        aria-label={t('common:offline_access')}
      />
      <label htmlFor="offlineMode" className="cursor-pointer select-none text-sm font-medium leading-none">
        {t('common:offline_access')}
      </label>
    </div>
  );
};
