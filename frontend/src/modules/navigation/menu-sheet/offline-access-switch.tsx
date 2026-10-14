import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { PreferenceSwitch } from '~/modules/navigation/menu-sheet/preferences-group';
import { useUIStore } from '~/modules/ui/ui-store';

export function OfflineAccessSwitch() {
  const { t } = useTranslation();
  const offlineAccess = useUIStore((state) => state.offlineAccess);
  const toggleOfflineAccess = useUIStore((state) => state.toggleOfflineAccess);

  const onCheckedChange = (isOffline: boolean) => {
    // Delay the toast until after the switch state updates through QueryProvider.
    setTimeout(() => {
      toaster.info(t(`c:offline_access_${isOffline ? 'on' : 'off'}.text`, { appName: appConfig.name }));
    }, 0);

    toggleOfflineAccess();
  };

  return (
    <PreferenceSwitch
      id="offlineMode"
      label={t('c:offline_access')}
      description={t('c:offline_access.text')}
      checked={offlineAccess}
      onCheckedChange={onCheckedChange}
    />
  );
}
