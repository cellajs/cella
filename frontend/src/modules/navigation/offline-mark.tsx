import { CloudOffIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { alertStore, useAlertStore } from '~/modules/common/alerter/alert-store';
import { collapseMotion } from '~/modules/common/motion-presets';
import { useOfflineMark } from '~/modules/navigation/use-offline-mark';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { recheckNow } from '~/query/offline/connectivity';
import { cn } from '~/utils/cn';

const explainerId = 'offline_mode';

/** A cloud-off badge on the menu nav button while the app is offline; each bar passes its position. */
export function OfflineNavMark({ className }: { className?: string }) {
  const { t } = useTranslation();
  const isShown = useOfflineMark();
  if (!isShown) return null;

  return (
    <span className={cn('intent-warning soft-bg soft-border soft-text absolute flex rounded-full border p-0.5', className)}>
      <CloudOffIcon className="size-3" />
      <span className="sr-only">{t('c:offline')}</span>
    </span>
  );
}

/** The menu's line while the mark shows: where changes go, with a retry. */
export function OfflineMenuAlert() {
  const { t } = useTranslation();
  const isShown = useOfflineMark();

  return (
    <AnimatePresence initial={false}>
      {isShown && (
        <motion.div key="offline" {...collapseMotion} className="overflow-hidden">
          <div className="px-3 pt-2">
            <Alert variant="warning">
              <CloudOffIcon />
              <AlertDescription>{t('c:offline_mode.summary')}</AlertDescription>
              <AlertAction>
                <Button variant="warning" soft size="xs" onClick={() => void recheckNow()}>
                  {t('c:try_again')}
                </Button>
              </AlertAction>
            </Alert>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The first time the mark shows for this user on this device, what offline means; Got it or close keeps it away. */
export function OfflineExplainer() {
  const { t } = useTranslation();
  const isShown = useOfflineMark();
  const isSeen = useAlertStore((state) => state.alertsSeen.includes(explainerId));
  // The server's down alert takes the same spot
  const isServerDown = useAlertStore((state) => state.downAlert);

  if (!isShown || isSeen || isServerDown) return null;

  const dismiss = () => alertStore.getState().setAlertSeen(explainerId);

  return (
    <div className="pointer-events-auto fixed right-4 left-4 z-2000 max-sm:top-4 sm:bottom-4">
      <Alert variant="warning" onClose={dismiss} className="soft-border-strong shadow-floating">
        <CloudOffIcon />
        <AlertTitle>{t('c:offline_mode')}</AlertTitle>
        <AlertDescription>{t('c:offline_mode.text')}</AlertDescription>
        <AlertAction>
          <Button variant="warning" soft size="sm" onClick={dismiss}>
            {t('c:got_it')}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
