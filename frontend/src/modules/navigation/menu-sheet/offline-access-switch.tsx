import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster';
import { Switch } from '~/modules/ui/switch';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';

export const OfflineAccessSwitch = () => {
  const { t } = useTranslation();
  const { offlineAccess, toggleOfflineAccess } = useUIStore();
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const onCheckedChange = (isOffline: boolean) => {
    // setTimeout is used to show the toast after the switch is toggled (QueryProvider updates)
    setTimeout(() => {
      toaster(t(`common:offline_access_${isOffline ? 'on' : 'off'}.text`, { appName: config.name }), 'info');
    }, 0);

    toggleOfflineAccess();

    // Close the navigation sheet & set it state to null
    useSheeter.getState().remove('nav-sheet');
    setNavSheetOpen(null);
  };

  return (
    <div className="flex items-center gap-4 ml-1">
      <Switch size="xs" id="offlineMode" checked={offlineAccess} onCheckedChange={onCheckedChange} aria-label={t('common:keep_menu_open')} />
      <label htmlFor="offlineMode" className="cursor-pointer select-none text-sm font-medium leading-none">
        {t('common:offline_access')}
      </label>
    </div>
  );
};
