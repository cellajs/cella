import { config } from 'config';
import { AlertTriangle, ClockAlert, CloudOff, Construction, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { healthCheck } from '~/lib/health-check';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';
import { useUIStore } from '~/store/ui';

const downAlertConfig = {
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
    variant: 'warning',
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

export type AlertKeys = keyof typeof downAlertConfig;

export const DownAlert = () => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const { offlineAccess } = useUIStore();
  const { downAlert, setDownAlert } = useAlertStore();

  // Track if user manually dismissed alert
  const [dismissedAlerts, setDismissedAlerts] = useState({} as Record<AlertKeys, boolean>);

  const dismissAlert = useCallback(() => {
    if (!downAlert) return;
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  }, [downAlert]);

  const resetDismiss = (key: AlertKeys) => setDismissedAlerts((prev) => ({ ...prev, [key]: false }));

  // Based on network status manages "offline" alert
  useEffect(() => {
    // Clear offline alert if back online or dismissed
    if (isOnline && downAlert === 'offline') setDownAlert(null);

    // Show offline alert if offline and not dismissed
    if (!isOnline) setDownAlert('offline');

    // Reset dismissal when back online
    return () => {
      if (isOnline) resetDismiss('offline');
    };
  }, [downAlert, isOnline]);

  // Triggered by Failed to fetch err on serv helth check and runs a delayed health check fn to wait for backend recovery
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || dismissedAlerts.backend_not_ready || !isOnline) return;

    const controller = new AbortController();
    const url = `${config.backendUrl}/ping`;

    (async () => {
      try {
        await fetch(url);
      } catch (err) {
        if (!(err instanceof Error) || !err.message.includes('Failed to fetch')) return;

        // Manually trigger backend_not_ready alert
        setDownAlert('backend_not_ready');
        const isBackendResponsive = await healthCheck({ url, initDelay: 5000, factor: 1, signal: controller.signal });

        if (isBackendResponsive && !controller.signal.aborted) setDownAlert(null);
      }
    })();

    return () => controller.abort(); // Cleanup any pending health check
  }, [isOnline, downAlert, dismissedAlerts.backend_not_ready]);

  if (!downAlert || dismissedAlerts[downAlert]) return null; // Nothing to show
  const { titleKey, textKey, icon: Icon, variant } = downAlertConfig[downAlert];

  // Determine i18n key and dynamic components for <Trans />
  const titleProps = { i18nKey: titleKey };
  const contentProps =
    downAlert === 'offline' && offlineAccess
      ? {
          i18nKey: 'common:offline_access.offline',
          components: { site_anchor: <button type="button" className="underline" onClick={dismissAlert} /> },
        }
      : { i18nKey: textKey };

  return (
    <div className="fixed z-2000 pointer-events-auto max-sm:bottom-20 bottom-4 left-4 right-4 border-0 justify-center">
      <Alert variant={variant} className="border-0 w-auto">
        {/* Dismiss Button */}
        <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={dismissAlert}>
          <X size={16} />
        </Button>

        <Icon size={16} />
        <AlertDescription className="pr-8 font-light">
          <Trans t={t} className="font-bold" {...titleProps} />
          <span className="mx-2">&#183;</span>
          <Trans t={t} className="max-sm:hidden" {...contentProps} />

          {/* Mobile "continue" button */}
          <button type="button" className="inline-block sm:hidden font-semibold" onClick={dismissAlert}>
            {t('common:continue')}
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
};
