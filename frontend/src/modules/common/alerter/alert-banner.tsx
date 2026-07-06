import type { VariantProps } from 'class-variance-authority';
import type { LucideProps } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import type { alertVariants } from '~/modules/ui/alert';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

export type AlertContextMode = 'public' | 'app';

export type AlertBanner = {
  className?: string;
  id: string;
  modes?: AlertContextMode[];
  icon?: React.ElementType<LucideProps>;
  children: React.ReactNode;
  title?: string;
  variant?: VariantProps<typeof alertVariants>['variant'];
  animate?: boolean;
  contextMode?: AlertContextMode;
};

export const AlertBanner = ({
  id,
  icon: Icon,
  children,
  className = '',
  title = '',
  variant = 'default',
  animate = false,
  contextMode = 'app',
}: AlertBanner) => {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen, downAlert } = useAlertStore();
  const { publicAlertsSeen, setPublicAlertSeen } = useUIStore();

  const isPublicContext = contextMode === 'public';
  const seenAlerts = isPublicContext ? publicAlertsSeen : alertsSeen;
  const setAsSeen = () => {
    if (isPublicContext) setPublicAlertSeen(id);
    else setAlertSeen(id);
  };
  const showAlert = !downAlert && !seenAlerts.includes(id);

  const alertContent = (
    <Alert variant={variant} onClose={setAsSeen} className={cn('relative', !animate && className)}>
      {Icon && <Icon size={16} />}
      {title && <AlertTitle className="pr-8">{t(title)}</AlertTitle>}
      {children && <AlertDescription className="pr-8">{children}</AlertDescription>}
    </Alert>
  );

  if (animate) {
    return (
      <AnimatePresence initial={false}>
        {showAlert && (
          <motion.div
            key={id}
            className={className}
            initial={{ height: 0, opacity: 0, overflow: 'hidden' }}
            animate={{ height: 'auto', opacity: 1, overflow: 'visible', transitionEnd: { overflow: 'visible' } }}
            exit={{ height: 0, opacity: 0, overflow: 'hidden' }}
          >
            {alertContent}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (!showAlert) return null;
  return alertContent;
};
