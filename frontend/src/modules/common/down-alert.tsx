import { config } from 'config';
import { CloudOff, Construction, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { healthCheck } from '~/lib/health-check';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';
import { useGeneralStore } from '~/store/general';

export const DownAlert = () => {
  const { t } = useTranslation();
  const { downAlert, setDownAlert } = useAlertStore();
  const { networkMode } = useGeneralStore();
  const { isOnline } = useOnlineManager();
  const [isNetworkAlertClosed, setIsNetworkAlertClosed] = useState(false);

  // Check if the user is offline or online and handle accordingly
  useEffect(() => {
    (async () => {
      if (isOnline && downAlert === 'offline') {
        setDownAlert(null);
      }
      if (!isOnline && !downAlert && !isNetworkAlertClosed) {
        setDownAlert('offline');
        if (networkMode === 'online') {
          const isBackendOnline = await healthCheck(`${config.backendUrl}/ping`);
          if (isBackendOnline) {
            setDownAlert(null);
          }
        }
      }
    })();
  }, [downAlert, isOnline, networkMode, isNetworkAlertClosed]);

  const cancelAlert = () => {
    setDownAlert(null);
    setIsNetworkAlertClosed(true);
  };

  const offlineText =
    networkMode === 'offline' ? (
      <Trans
        i18nKey="common:offline_mode.text"
        t={t}
        components={{
          site_anchor: <button type="button" className="underline" onClick={cancelAlert} />,
        }}
      />
    ) : (
      t('common:offline.text')
    );

  if (!downAlert) return <></>;

  return (
    <div className="fixed z-[2000] max-sm:bottom-20 bottom-4 left-4 right-4 border-0 justify-center">
      <Alert variant="destructive" className="border-0 w-auto">
        <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={cancelAlert}>
          <X size={16} />
        </Button>
        {downAlert === 'maintenance' ? <Construction size={16} /> : <CloudOff size={16} />}

        <AlertDescription className="pr-8 font-light">
          <strong>{downAlert === 'maintenance' ? t('common:maintenance_mode') : t('common:offline')}</strong>
          <span className="max-sm:hidden mx-2">&#183;</span>
          <span className="max-sm:hidden">{downAlert === 'maintenance' ? t('common:maintenance_mode.text') : offlineText}</span>
          {config.statusUrl && (
            <>
              <span className="sm:hidden mx-2">&#183;</span>
              <a
                href={config.statusUrl}
                className="max-sm:capitalize ml-1 hover:underline font-semibold hover:underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                {t('common:status_page')}
              </a>
              <span className="max-sm:hidden">.</span>
            </>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};
