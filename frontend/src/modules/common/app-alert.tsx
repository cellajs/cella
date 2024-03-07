import { Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { useAlertsStore } from '~/store/alerts';
import { Button } from '../ui/button';

const CURRENT_ALERT = 'experimental';

export function AppAlert() {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen } = useAlertsStore();
  const showAlert = !alertsSeen.includes(CURRENT_ALERT);
  const closeAlert = () => setAlertSeen(CURRENT_ALERT);

  if (!showAlert) return;

  return (
    <Alert className="rounded-none border-0 border-b relative">
      <Info size={16} />
      <AlertDescription className="pr-8 font-light">
        <Button variant="ghost" size="sm" className="absolute top-2 right-1" onClick={closeAlert}>
          <X size={16} />
        </Button>
        <strong className="mr-2">{t('common:prerelease')}</strong>
        {t('common:text.experiment_notice')}
      </AlertDescription>
    </Alert>
  );
}
