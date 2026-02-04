import { t } from 'i18next';
import { AlertTriangleIcon, ClockAlertIcon, CloudOffIcon, ConstructionIcon, ShieldAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans } from 'react-i18next';
import { appConfig } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { healthCheck } from '~/lib/health-check';
import CloseButton from '~/modules/common/close-button';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useAlertStore } from '~/store/alert';
import { useUIStore } from '~/store/ui';

// Configuration for different down alerts
const downAlertConfig = {
  offline: {
    icon: CloudOffIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="common:offline" />,
    getContent: (dismissAlert: () => void) => {
      const offlineAccess = useUIStore.getState().offlineAccess;
      const i18nKey = offlineAccess ? 'common:offline_access.offline' : 'common:offline.text';
      const components = offlineAccess
        ? { site_anchor: <button type="button" className="underline" onClick={dismissAlert} /> }
        : undefined;
      return <Trans t={t} className="max-sm:hidden" i18nKey={i18nKey} components={components} />;
    },
    textKey: 'common:offline.text',
    variant: 'warning',
  },
  backend_not_ready: {
    icon: ClockAlertIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="common:backend_not_ready" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="common:backend_not_ready.text" />,
    variant: 'warning',
  },
  maintenance: {
    icon: ConstructionIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="common:maintenance_mode" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="common:maintenance_mode.text" />,
    variant: 'destructive',
  },
  auth_unavailable: {
    icon: AlertTriangleIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="common:auth_unavailable" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="common:auth_unavailable.text" />,
    variant: 'plain',
  },
  enable_mfa: {
    icon: ShieldAlertIcon,
    getTitle: () => <Trans t={t} className="font-bold" i18nKey="common:require_mfa" />,
    getContent: () => <Trans t={t} className="max-sm:hidden" i18nKey="common:require_mfa.text" />,
    variant: 'plain',
  },
} as const;

export type AlertKeys = keyof typeof downAlertConfig;

/**
 * Down alert component that shows alerts based on application status.
 */
export const DownAlert = () => {
  const { isOnline } = useOnlineManager();
  const { downAlert, setDownAlert } = useAlertStore();

  // Track if user manually dismissed alert
  const [dismissedAlerts, setDismissedAlerts] = useState({} as Record<AlertKeys, boolean>);

  const dismissAlert = () => {
    if (!downAlert) return;
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  };

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

  // Triggered by Failed to fetch err on server health check and runs a delayed health check fn to wait for backend recovery
  useEffect(() => {
    if (downAlert !== 'backend_not_ready' || dismissedAlerts.backend_not_ready || !isOnline) return;

    const controller = new AbortController();

    (async () => {
      const isBackendResponsive = await healthCheck({
        url: `${appConfig.backendUrl}/ping`,
        initDelay: 5000,
        factor: 1,
        signal: controller.signal,
      });

      if (isBackendResponsive && !controller.signal.aborted) setDownAlert(null);
    })();

    return () => controller.abort(); // Cleanup any pending health check
  }, [isOnline, downAlert, dismissedAlerts.backend_not_ready]);

  if (!downAlert || dismissedAlerts[downAlert]) return null; // Nothing to show
  const { getTitle, getContent, icon: Icon, variant } = downAlertConfig[downAlert];

  return (
    <div className="fixed z-2000 pointer-events-auto bottom-4 max-sm:bottom-20 left-4 right-4 border-0 justify-center">
      <Alert variant={variant} className="border-0 w-auto">
        <CloseButton onClick={dismissAlert} size="sm" className="absolute top-1 right-1" />
        <Icon size={16} />
        <AlertDescription className="pr-8 font-light">
          {getTitle()}
          <span className="mx-2">&#183;</span>
          {getContent(dismissAlert)}
        </AlertDescription>
      </Alert>
    </div>
  );
};
