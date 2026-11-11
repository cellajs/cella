import { AnimatePresence, motion } from 'motion/react';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { TKey } from '~/lib/i18n-locales';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import type { IconComponent } from '~/modules/common/icons/types';
import { collapseMotion } from '~/modules/common/motion-presets';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useUIStore } from '~/modules/ui/ui-store';

export type AlertContextMode = 'public' | 'app';

/** An entry of the app's `alertsConfig` (`alert-config.tsx`). */
export interface AlertBanner {
  className?: string;
  id: string;
  modes?: AlertContextMode[];
  icon?: IconComponent;
  children: ReactNode;
  title?: TKey;
  action?: ReactNode;
  variant?: ComponentProps<typeof Alert>['variant'];
  animate?: boolean;
  contextMode?: AlertContextMode;
}

export function AlertBanner({ id, icon: Icon, children, className, title, action, variant, animate, contextMode }: AlertBanner) {
  const { t } = useTranslation();
  const alertsSeen = useAlertStore((state) => state.alertsSeen);
  const setAlertSeen = useAlertStore((state) => state.setAlertSeen);
  const isServerDown = useAlertStore((state) => state.downAlert);
  const isOnline = useOnlineManager();
  const publicAlertsSeen = useUIStore((state) => state.publicAlertsSeen);
  const setPublicAlertSeen = useUIStore((state) => state.setPublicAlertSeen);

  const isPublicContext = contextMode === 'public';
  const seenAlerts = isPublicContext ? publicAlertsSeen : alertsSeen;
  const setAsSeen = () => (isPublicContext ? setPublicAlertSeen(id) : setAlertSeen(id));
  const showAlert = !isServerDown && isOnline && !seenAlerts.includes(id);

  const alertContent = (
    <Alert variant={variant} onClose={setAsSeen} className={className}>
      {Icon && <Icon />}
      {title && <AlertTitle>{t(title)}</AlertTitle>}
      <AlertDescription>{children}</AlertDescription>
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
