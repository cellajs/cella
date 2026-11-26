import { ServerOffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { Alert, AlertDescription } from '~/modules/ui/alert';

/** The server's down alert; one the user dismissed stays hidden until that outage ends. */
export function DownAlert() {
  const { t } = useTranslation();
  const isServerDown = useAlertStore((state) => state.downAlert);
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset during render, so the next outage shows from its first frame.
  if (!isServerDown && isDismissed) setIsDismissed(false);

  if (!isServerDown || isDismissed) return null;

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 max-sm:top-4 sm:bottom-4">
      <Alert variant="destructive" onClose={() => setIsDismissed(true)} className="soft-border-strong shadow-floating">
        <ServerOffIcon />
        <AlertDescription>
          <span className="font-bold">{t('c:server_unreachable')}</span>
          <span className="mx-2">&#183;</span>
          {t('c:server_unreachable.text')}
        </AlertDescription>
      </Alert>
    </div>
  );
}
