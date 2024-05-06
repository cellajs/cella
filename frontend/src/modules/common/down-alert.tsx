import { config } from 'config';
import { CloudOff, Construction, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { healthCheck } from '~/lib/health-check';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useAlertStore } from '~/store/alert';
import { Button } from '../ui/button';

export const DownAlert = () => {
  const { t } = useTranslation();
  const { downAlert, setDownAlert } = useAlertStore();

  // Check if the user is offline or online and handle accordingly
  useEffect(() => {
    let isMounted = true;

    const updateOnlineStatus = async () => {
      if (navigator.onLine && downAlert === 'offline') {
        setDownAlert(null);
      }
      if (!navigator.onLine && !downAlert) {
        setDownAlert('offline');

        const isBackendOnline = await healthCheck(`${config.backendUrl}/ping`);
        if (isBackendOnline && isMounted) {
          setDownAlert(null);
        }
      }
    };

    // Listen for online/offline changes
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      isMounted = false;
    };
  }, [downAlert]);

  if (!downAlert) return;

  return (
    <div className="fixed z-[300] bottom-0 border-0 p-4 flex w-full justify-center">
      <Alert variant="destructive" className="border-0 w-auto">
        <Button variant="ghost" size="sm" className="absolute top-2 right-1" onClick={() => setDownAlert(null)}>
          <X size={16} />
        </Button>
        {downAlert === 'maintenance' ? <Construction size={16} /> : <CloudOff size={16} />}

        <AlertDescription className="pr-8 font-light">
          <strong>{downAlert === 'maintenance' ? t('common:maintenance_mode') : t('common:offline_mode')}</strong>
          <span className="max-sm:hidden mx-2">&#183;</span>
          <span className="max-sm:hidden">{downAlert === 'maintenance' ? t('common:maintenance_mode.text') : t('common:offline_mode.text')}</span>
          {config.statusUrl && (
            <span>
              <span className="max-sm:hidden ml-1">Try again later or check our server</span>
              <span className="sm:hidden mx-2">&#183;</span>
              <a
                href={config.statusUrl}
                className="max-sm:capitalize ml-1 hover:underline font-semibold hover:underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                status
              </a>
              <span className="max-sm:hidden">.</span>
            </span>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
};
