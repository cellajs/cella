import { config } from 'config';
import { Info, X } from 'lucide-react';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { useAlertsStore } from '~/store/alerts';
import { Button } from './ui/button';

const CURRENT_ALERT = 'experimental';

export function AppAlert() {
  const { alertSeen, setAlertSeen } = useAlertsStore();
  const showAlert = alertSeen !== CURRENT_ALERT;
  const closeAlert = () => setAlertSeen(CURRENT_ALERT);

  if (showAlert && config.mode === 'production')
    return (
      <Alert className="rounded-none border-0 border-b relative">
        <Info size={16} />
        <AlertDescription className="pr-8 font-light">
          <Button variant="ghost" size="sm" className="absolute top-2 right-1" onClick={closeAlert}>
            <X size={16} />
          </Button>
          <strong className="mr-2">Experimental</strong>
          Things might not work yet or break. This site is online to experiment and discuss further development.
        </AlertDescription>
      </Alert>
    );
}
