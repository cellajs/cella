import type { VariantProps } from 'class-variance-authority';
import { type LucideProps, X } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useAlertStore } from '~/store/alert';
import type { alertVariants } from '../ui/alert';
import { Button } from '../ui/button';

export type AppAlert = {
  className?: string;
  id: string;
  Icon?: React.ElementType<LucideProps>;
  children: React.ReactNode;
  title?: string;
  variant?: VariantProps<typeof alertVariants>['variant'];
};

export const AppAlert = ({ id, Icon, children, className = '', title = '', variant = 'default' }: AppAlert) => {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen, downAlert } = useAlertStore();
  const showAlert = !alertsSeen.includes(id);
  const closeAlert = () => setAlertSeen(id);

  if ( downAlert || !showAlert) return;

  return (
    <Alert variant={variant} className={cn('relative', className)}>
      <Button variant="ghost" size="sm" className="absolute top-2 right-2" onClick={closeAlert}>
        <X size={16} />
      </Button>
      {Icon && <Icon size={16} />}
      {title && <AlertTitle className="pr-8">{t(title)}</AlertTitle>}

      {children && <AlertDescription className="pr-8 font-light">{children}</AlertDescription>}
    </Alert>
  );
};
