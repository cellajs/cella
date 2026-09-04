import { useIsFetching } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useDebounce } from '~/hooks/use-debounce';
import type { IconComponent } from '~/modules/common/icons/types';
import { Logo } from '~/modules/common/logo';
import { Spinner } from '~/modules/common/spinner';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { cn } from '~/utils/cn';

/** Brand intro on first load, then the item's icon, swapped for a spinner while queries or navigation are in flight. */
export function AppNavLoader({ className, icon: Icon }: { className?: string; icon: IconComponent }) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  useEffect(() => {
    const timeout = setTimeout(() => setHasLoaded(true), 3000);
    return () => clearTimeout(timeout);
  }, []);

  const isFetching = useIsFetching();

  // The router owns this flag and resets it on every load outcome, including aborted and superseded ones.
  const navLoading = useRouterState({ select: (state) => state.status === 'pending' });
  const isLoadingRaw = isFetching > 0 || navLoading;

  // Delays showing the spinner, hides it instantly.
  const isLoading = useDebounce(isLoadingRaw, 300, { immediateValue: false });

  const showLogo = !hasLoaded && navSheetOpen !== 'menu';

  // No animation when the logo was never shown.
  const skipInitialAnimation = !hasLoaded && navSheetOpen === 'menu';

  return (
    <div className="relative flex size-10 items-center justify-center overflow-visible">
      <AnimatePresence>
        {showLogo && (
          <motion.div
            key="logo"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              opacity: { duration: 0.15 },
              scale: { type: 'spring', stiffness: 300, damping: 15 },
            }}
            className="absolute"
          >
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{
                duration: 1.5,
                repeat: 1,
                repeatDelay: 0.3,
                ease: 'easeInOut',
              }}
            >
              <Logo iconOnly height={34} className="saturate-[.9]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!showLogo && (
          <motion.div
            key={isLoading ? 'spinner' : 'icon'}
            initial={skipInitialAnimation ? false : { opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              opacity: { duration: 0.15 },
              scale: { type: 'spring', stiffness: 300, damping: 17 },
            }}
            className="absolute"
          >
            {isLoading ? (
              <Spinner className={cn('size-5', className)} noDelay />
            ) : (
              <div className="transition-transform group-hover:scale-110">
                <Icon strokeWidth={1.8} className={cn('size-5 min-h-5 min-w-5', className)} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
