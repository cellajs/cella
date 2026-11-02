import { CloudOffIcon, ServerOffIcon } from 'lucide-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { useOfflineAlert } from '~/modules/common/alerter/use-offline-alert';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { recheckNow } from '~/query/offline/connectivity';

const downAlertConfig = {
  offline: { icon: CloudOffIcon, titleKey: 'c:offline', textKey: 'c:offline.alert', variant: 'warning' },
  server: { icon: ServerOffIcon, titleKey: 'c:server_unreachable', textKey: 'c:server_unreachable.text', variant: 'destructive' },
} as const;

/** The server's down alert, else the offline alert; a server alert the user dismissed stays hidden until that outage ends. */
export function DownAlert() {
  const { t } = useTranslation();
  const isServerDown = useAlertStore((state) => state.downAlert);
  const [isDismissed, setIsDismissed] = useState(false);
  const offlineAlert = useOfflineAlert();

  // Reset during render, so the next outage shows from its first frame.
  if (!isServerDown && isDismissed) setIsDismissed(false);

  const isServerShown = isServerDown && !isDismissed;
  if (!isServerShown && !offlineAlert.isShown) return null;

  const dismissAlert = () => (isServerShown ? setIsDismissed(true) : offlineAlert.dismiss());
  const { icon: Icon, titleKey, textKey, variant } = downAlertConfig[isServerShown ? 'server' : 'offline'];

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 max-sm:top-4 sm:bottom-4">
      <Alert variant={variant} onClose={dismissAlert} className="soft-border-strong shadow-floating">
        <Icon />
        <AlertDescription>
          <span className="font-bold">{t(titleKey)}</span>
          <span className="mx-2">&#183;</span>
          <Trans
            t={t}
            i18nKey={textKey}
            components={{
              site_anchor: <button type="button" className="link-inline font-semibold" onClick={dismissAlert} />,
              retry_anchor: <button type="button" className="link-inline font-semibold" onClick={() => void recheckNow()} />,
            }}
          />
        </AlertDescription>
      </Alert>
    </div>
  );
}
