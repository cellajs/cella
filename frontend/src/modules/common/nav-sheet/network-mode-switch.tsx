import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { sheet } from '~/modules/common/sheeter/state';
import { Switch } from '~/modules/ui/switch';
import { useGeneralStore } from '~/store/general';
import { useNavigationStore } from '~/store/navigation';

export const NetworkModeSwitch = () => {
  const { t } = useTranslation();
  const { offlineAccess, toggleOfflineAccess } = useGeneralStore();
  const { setNavSheetOpen } = useNavigationStore();

  const onCheckedChange = (isOffline: boolean) => {
    // setTimeout is used to show the toast after the switch is toggled (QueryProvider updates)
    setTimeout(() => {
      showToast(t(`common:offline_mode_${isOffline ? 'on' : 'off'}.text`, { appName: config.name }), 'info');
    }, 0);

    toggleOfflineAccess();

    // Close the navigation sheet & set it state to null
    sheet.remove('nav-sheet');
    setNavSheetOpen(null);
  };

  return (
    <div className="flex items-center gap-4 ml-1">
      <Switch size="xs" id="offlineMode" checked={offlineAccess} onCheckedChange={onCheckedChange} aria-label={t('common:keep_menu_open')} />
      <label htmlFor="offlineMode" className="cursor-pointer select-none text-sm font-medium leading-none">
        {t('common:offline_mode')}
      </label>
    </div>
  );
};
