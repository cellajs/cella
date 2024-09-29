import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { Switch } from '~/modules/ui/switch';
import { useGeneralStore } from '~/store/general';

export const NetworkModeSwitch = () => {
  const { t } = useTranslation();
  const { networkMode, setNetworkMode } = useGeneralStore();

  const onCheckedChange = (isOffline: boolean) => {
    // setTimeout is used to show the toast after the switch is toggled (QueryProvider updates)
    setTimeout(() => {
      showToast(t(`common:offline_mode_${isOffline ? 'on' : 'off'}.text`, { appName: config.name }), 'info');
    }, 0);

    setNetworkMode(isOffline ? 'offline' : 'online');
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
