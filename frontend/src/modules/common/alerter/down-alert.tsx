import { ClockAlertIcon, CloudOffIcon, ConstructionIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { type AlertKey, useAlertStore } from '~/modules/common/alerter/alert-store';
import { useUIOffline } from '~/modules/common/alerter/use-ui-offline';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { forceOnline } from '~/query/offline/connectivity';

const downAlertConfig = {
  offline: { icon: CloudOffIcon, titleKey: 'c:offline', textKey: 'c:offline.alert', variant: 'warning' },
  backend_not_ready: { icon: ClockAlertIcon, titleKey: 'c:backend_not_ready', textKey: 'c:backend_not_ready.text', variant: 'warning' },
  maintenance: { icon: ConstructionIcon, titleKey: 'c:maintenance_mode', textKey: 'c:maintenance_mode.text', variant: 'destructive' },
  auth_unavailable: { icon: TriangleAlertIcon, titleKey: 'c:auth_unavailable', textKey: 'c:auth_unavailable.text', variant: 'plain' },
} as const;

export function DownAlert() {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const downAlert = useAlertStore((state) => state.downAlert);
  const setDownAlert = useAlertStore((state) => state.setDownAlert);
  const [dismissedAlerts, setDismissedAlerts] = useState<Partial<Record<AlertKey, boolean>>>({});

  useUIOffline();

  const dismissAlert = () => {
    if (!downAlert) return;
    setDismissedAlerts((prev) => ({ ...prev, [downAlert]: true }));
    setDownAlert(null);
  };

  const retry = () => {
    forceOnline();
    dismissAlert();
  };

  // Returning connectivity re-arms the offline alert
  useEffect(() => {
    if (isOnline) setDismissedAlerts((prev) => ({ ...prev, offline: false }));
  }, [isOnline]);

  if (!downAlert || dismissedAlerts[downAlert] || !(downAlert in downAlertConfig)) return null;
  const { icon: Icon, titleKey, textKey, variant } = downAlertConfig[downAlert];

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 max-sm:top-4 sm:bottom-4">
      <Alert variant={variant} onClose={dismissAlert}>
        <Icon />
        <AlertDescription>
          <span className="font-bold">{t(titleKey)}</span>
          <span className="mx-2">&#183;</span>
          <Trans
            t={t}
            i18nKey={textKey}
            components={{
              site_anchor: <button type="button" className="link-inline font-semibold" onClick={dismissAlert} />,
              retry_anchor: <button type="button" className="link-inline font-semibold" onClick={retry} />,
            }}
          />
        </AlertDescription>
      </Alert>
    </div>
  );
}
