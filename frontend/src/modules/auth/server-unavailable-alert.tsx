import { ServerOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';

/** Says in place that the server gave no usable answer, on an auth page that cannot go on without one. */
export function ServerUnavailableAlert() {
  const { t } = useTranslation();

  return (
    <Alert variant="destructive" className="soft-border-strong border-2">
      <ServerOffIcon />
      <AlertTitle>{t('c:server_unreachable')}</AlertTitle>
      <AlertDescription>{t('c:server_unreachable.text')}</AlertDescription>
    </Alert>
  );
}
