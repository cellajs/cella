import { config } from 'config';
import { AlertTriangle, ClockAlert, CloudOff, Construction, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { healthCheck } from '~/lib/health-check';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';
import { useUIStore } from '~/store/ui';

export const downAlertConfig = {
  offline: {
    icon: CloudOff,
    titleKey: 'common:offline',
    textKey: 'common:offline.text',
    variant: 'destructive',
  },
  backend_not_ready: {
    icon: ClockAlert,
    titleKey: 'common:backend_not_ready',
    textKey: 'common:backend_not_ready.text',
    variant: 'plain',
  },
  maintenance: {
    icon: Construction,
    titleKey: 'common:maintenance_mode',
    textKey: 'common:maintenance_mode.text',
    variant: 'destructive',
  },
  auth_unavailable: {
    icon: AlertTriangle,
    titleKey: 'common:auth_unavailable',
    textKey: 'common:auth_unavailable.text',
    variant: 'plain',
  },
} as const;

const url = `${config.backendUrl}/ping`;

export const DownAlert = () => {
  const { t } = useTranslation();
  const { downAlert, setDownAlert } = useAlertStore();
  const { offlineAccess } = useUIStore();
  const { isOnline } = useOnlineManager();

  const devAlert = useRef(env.VITE_DEV_ALERT);
  const [isNetworkAlertClosed, setIsNetworkAlertClosed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      if (isOnline && downAlert === 'offline') setDownAlert(null);

      if (isOnline || (!downAlert && !isNetworkAlertClosed))
        if (!isOnline && !downAlert && !isNetworkAlertClosed) {
          setDownAlert('offline');

          if (!offlineAccess) {
            const isBackendOnline = await healthCheck({ url, signal: controller.signal });
            if (isBackendOnline) setDownAlert(null);
          }
        }
    })();

    return () => controller.abort(); // abort healthCheck if effect is cleaned up early
  }, [downAlert, isOnline, offlineAccess, isNetworkAlertClosed]);

  useEffect(() => {
    if (!isOnline && downAlert === 'backend_not_ready') setDownAlert(null);

    if (process.env.NODE_ENV !== 'development' || !devAlert.current || !isOnline) return;

    useAlertStore.getState().setDownAlert('backend_not_ready');

    const controller = new AbortController();

    (async () => {
      if (downAlert === 'backend_not_ready') {
        const isBackendResponsive = await healthCheck({ url, initDelay: 5000, factor: 1, signal: controller.signal });

        if (isBackendResponsive && !controller.signal.aborted) {
          devAlert.current = false;
          setDownAlert(null);
        }
        return;
      }
    })();

    return () => controller.abort();
  }, [isOnline, downAlert]);

  const cancelAlert = () => {
    setDownAlert(null);
    setIsNetworkAlertClosed(true);
  };

  if (!downAlert) return null;

  const alertConfig = downAlertConfig[downAlert] || downAlertConfig.offline;
  const Icon = alertConfig.icon;

  const alertText =
    downAlert === 'offline' && offlineAccess ? (
      <Trans
        i18nKey="common:offline_access.offline"
        t={t}
        components={{
          site_anchor: <button type="button" className="underline" onClick={cancelAlert} />,
        }}
      />
    ) : (
      t(alertConfig.textKey)
    );

  return (
    <div className="fixed z-2000 pointer-events-auto max-sm:bottom-20 bottom-4 left-4 right-4 border-0 justify-center">
      <Alert variant={alertConfig.variant} className="border-0 w-auto">
        <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={cancelAlert}>
          <X size={16} />
        </Button>
        <Icon size={16} />

        <AlertDescription className="pr-8 font-light">
          <strong>{t(alertConfig.titleKey)}</strong>
          <span className="mx-2">&#183;</span>
          <span className="max-sm:hidden">{alertText}</span>
          <button type="button" className="inline-block sm:hidden font-semibold" onClick={cancelAlert}>
            {t('common:continue')}
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
};
