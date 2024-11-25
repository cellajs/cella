import type { VariantProps } from 'class-variance-authority';
import { type LucideProps, X } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { alertVariants } from '~/modules/ui/alert';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useAlertStore } from '~/store/alert';
import { cn } from '~/utils/cn';

export type MainAlert = {
  className?: string;
  id: string;
  Icon?: React.ElementType<LucideProps>;
  children: React.ReactNode;
  title?: string;
  variant?: VariantProps<typeof alertVariants>['variant'];
};

export const MainAlert = ({ id, Icon, children, className = '', title = '', variant = 'default' }: MainAlert) => {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen, downAlert } = useAlertStore();
  const showAlert = !alertsSeen.includes(id);
  const closeAlert = () => setAlertSeen(id);

  if (downAlert || !showAlert) return;

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
