import type { VariantProps } from 'class-variance-authority';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { collapseMotion } from '~/modules/common/collapse-motion';
import type { IconComponent } from '~/modules/common/icons/types';
import { Alert, AlertAction, AlertDescription, AlertTitle, type alertVariants } from '~/modules/ui/alert';
import { useUIStore } from '~/modules/ui/ui-store';

export type AlertContextMode = 'public' | 'app';

interface AlertBannerProps {
  className?: string;
  id: string;
  modes?: AlertContextMode[];
  icon?: IconComponent;
  children: ReactNode;
  title?: TKey;
  action?: ReactNode;
  variant?: VariantProps<typeof alertVariants>['variant'];
  animate?: boolean;
  contextMode?: AlertContextMode;
}

/** An entry of the app's `alertsConfig` (`alert-config.tsx`). */
export type AlertBanner = AlertBannerProps;

export function AlertBanner({
  id,
  icon: Icon,
  children,
  className = '',
  title,
  action,
  variant = 'default',
  animate = false,
  contextMode = 'app',
}: AlertBannerProps) {
  const { t } = useTranslation();
  const alertsSeen = useAlertStore((state) => state.alertsSeen);
  const setAlertSeen = useAlertStore((state) => state.setAlertSeen);
  const isDown = useAlertStore((state) => !!state.downAlert || state.offlineAlertShown);
  const publicAlertsSeen = useUIStore((state) => state.publicAlertsSeen);
  const setPublicAlertSeen = useUIStore((state) => state.setPublicAlertSeen);

  const isPublicContext = contextMode === 'public';
  const seenAlerts = isPublicContext ? publicAlertsSeen : alertsSeen;
  const setAsSeen = () => {
    if (isPublicContext) setPublicAlertSeen(id);
    else setAlertSeen(id);
  };
  const showAlert = !isDown && !seenAlerts.includes(id);

  const alertContent = (
    <Alert variant={variant} onClose={setAsSeen} className={className}>
      {Icon && <Icon />}
      {title && <AlertTitle>{t(title)}</AlertTitle>}
      {children && <AlertDescription>{children}</AlertDescription>}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  );

  if (animate) {
    return (
      <AnimatePresence initial={false}>
        {showAlert && (
          // A margin on the alert stays inside the measured height, so it opens and closes with the block
          <motion.div key={id} {...collapseMotion} className="overflow-hidden">
            {alertContent}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  if (!showAlert) return null;
  return alertContent;
}
