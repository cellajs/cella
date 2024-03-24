import { type LucideProps, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useAlertsStore } from '~/store/alerts';
import { Button } from '../ui/button';
import { cn } from '~/lib/utils';
import type React from 'react';

export type AppAlert = {
  className?: string;
  id: string;
  Icon?: React.ElementType<LucideProps>;
  children: React.ReactNode;
  title?: string;
  variant?: 'default' | 'destructive';
};

export function AppAlert({ id, Icon, children, className = '', title = '', variant = 'default' }: AppAlert) {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen } = useAlertsStore();
  const showAlert = !alertsSeen.includes(id);
  const closeAlert = () => setAlertSeen(id);

  if (!showAlert) return;

  return (
    <Alert variant={variant} className={cn('relative', className)}>
      <Button variant="ghost" size="sm" className="absolute top-2 right-1" onClick={closeAlert}>
        <X size={16} />
      </Button>
      {Icon && <Icon size={16} />}
      {title && <AlertTitle className="pr-8">{t(title)}</AlertTitle>}

      {children && <AlertDescription className="pr-8 font-light">{children}</AlertDescription>}
    </Alert>
  );
}
