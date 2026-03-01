import type { VariantProps } from 'class-variance-authority';
import type { LucideProps } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { CloseButton } from '~/modules/common/close-button';
import type { alertVariants } from '~/modules/ui/alert';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useAlertStore } from '~/store/alert';
import { cn } from '~/utils/cn';

export type AlertContextMode = 'public' | 'app';

export type AlertWrap = {
  className?: string;
  id: string;
  modes?: AlertContextMode[];
  icon?: React.ElementType<LucideProps>;
  children: React.ReactNode;
  title?: string;
  variant?: VariantProps<typeof alertVariants>['variant'];
  animate?: boolean;
};

export const AlertWrap = ({
  id,
  icon: Icon,
  children,
  className = '',
  title = '',
  variant = 'default',
  animate = false,
}: AlertWrap) => {
  const { t } = useTranslation();
  const { alertsSeen, setAlertSeen, downAlert } = useAlertStore();

  const showAlert = !downAlert && !alertsSeen.includes(id);
  const setAsSeen = () => setAlertSeen(id);

  const alertContent = (
    <Alert variant={variant} className={cn('relative', !animate && className)}>
      <CloseButton onClick={setAsSeen} size="md" className="absolute top-2 right-2" />
      {Icon && <Icon size={16} />}
      {title && <AlertTitle className="pr-8">{t(title)}</AlertTitle>}
      {children && <AlertDescription className="pr-8 font-light">{children}</AlertDescription>}
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
