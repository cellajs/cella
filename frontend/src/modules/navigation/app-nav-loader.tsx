import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useDebounce } from '~/hooks/use-debounce';
import type { IconComponent } from '~/modules/common/icons/types';
import { Logo } from '~/modules/common/logo';
import { navIconStrokeWidth } from '~/modules/navigation/nav-buttons';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Spinner } from '~/modules/ui/spinner';
import { cn } from '~/utils/cn';

// Requests have no client timeout, so one that never settles (often after a phone wakes) would keep the spinner going.
const loadingBreakerMs = 15_000;

/** The app's logo mark as a nav icon, a size up from the line icons so the mark reads at nav bar size. */
export function AppIcon({ className }: { className?: string }) {
  return <Logo iconOnly height={28} className={cn(className, 'size-7 sm:size-7')} />;
}

/** Brand intro on first load, then the item's icon, swapped for a spinner while queries or navigation are in flight. */
export function AppNavLoader({ className, icon: Icon }: { className?: string; icon: IconComponent }) {
  const queryClient = useQueryClient();
  const [hasLoaded, setHasLoaded] = useState(false);
  const [breakerOpen, setBreakerOpen] = useState(false);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  useEffect(() => {
    const timeout = setTimeout(() => setHasLoaded(true), 3000);
    return () => clearTimeout(timeout);
  }, []);

  const isFetching = useIsFetching();

  // The router owns this flag and resets it on every load outcome, including aborted and superseded ones.
  const navLoading = useRouterState({ select: (state) => state.status === 'pending' });
  const isLoadingRaw = isFetching > 0 || navLoading;

  // Back to the icon after loadingBreakerMs of unbroken loading; the spinner returns once everything has settled.
  useEffect(() => {
    if (!isLoadingRaw) {
      setBreakerOpen(false);
      return;
    }
    const timeout = setTimeout(() => {
      setBreakerOpen(true);
      const stuckQueries = queryClient
        .getQueryCache()
        .findAll({ fetchStatus: 'fetching' })
        .map((query) => query.queryKey);
      console.warn(`[AppNavLoader] Still loading after ${loadingBreakerMs / 1000}s, spinner hidden`, { navLoading, stuckQueries });
    }, loadingBreakerMs);
    return () => clearTimeout(timeout);
  }, [isLoadingRaw, navLoading, queryClient]);

  // Delays showing the spinner, hides it instantly.
  const isLoading = useDebounce(isLoadingRaw && !breakerOpen, 300, { immediateValue: false });

  const showLogo = !hasLoaded && navSheetOpen !== 'menu';

  // No animation when the logo was never shown.
  const skipInitialAnimation = !hasLoaded && navSheetOpen === 'menu';

  return (
    <div className="relative flex size-10 items-center justify-center">
      <AnimatePresence>
        {showLogo && (
          <motion.div
            key="logo"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ opacity: { duration: 0.15 }, scale: { type: 'spring', stiffness: 300, damping: 15 } }}
            className="absolute"
          >
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.5, repeat: 1, repeatDelay: 0.3, ease: 'easeInOut' }}>
              <Logo iconOnly height={34} className="saturate-90" />
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
            transition={{ opacity: { duration: 0.15 }, scale: { type: 'spring', stiffness: 300, damping: 17 } }}
            className="absolute"
          >
            {isLoading ? (
              <Spinner strokeWidth={navIconStrokeWidth} className={cn('size-5', className)} />
            ) : (
              <Icon strokeWidth={navIconStrokeWidth} className={cn('size-5', className)} />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
