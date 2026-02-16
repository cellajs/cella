import { useIsFetching } from '@tanstack/react-query';
import { HomeIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useDebounce } from '~/hooks/use-debounce';
import { useMountedState } from '~/hooks/use-mounted-state';
import { Logo } from '~/modules/common/logo';
import { Spinner } from '~/modules/common/spinner';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/cn';

/**
 * Navigation loader component.
 * Shows logo for 3 seconds on startup (scales up and fades in), then transitions out
 * before the home icon appears. During subsequent loading states, shows a spinner.
 * Skips the initial logo animation if the menu sheet is already open.
 * Uses debounced loading state to avoid flickering for quick loads.
 */
export function AppNavLoader({ className }: { className?: string }) {
  const { hasLoaded } = useMountedState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);

  const isFetching = useIsFetching({
    predicate: (query) => {
      if (query.meta === undefined || !('offlinePrefetch' in query.meta) || !query.meta.offlinePrefetch) return true;
      return false;
    },
  });

  const navLoading = useNavigationStore((state) => state.navLoading);
  const isLoadingRaw = isFetching > 0 || navLoading;

  // Debounce loading state: delays showing spinner but hides it instantly
  const isLoading = useDebounce(isLoadingRaw, 200, { immediateValue: false });

  // Skip logo phase if menu sheet is open or initial load completed
  const showLogo = !hasLoaded && navSheetOpen !== 'menu';

  // Skip animation if logo was never shown (menu was open during initial phase)
  const skipInitialAnimation = !hasLoaded && navSheetOpen === 'menu';

  return (
    <div className="relative flex items-center justify-center size-10 overflow-visible">
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
            key={isLoading ? 'spinner' : 'home'}
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
              <div className="group-hover:scale-110 transition-transform">
                <HomeIcon strokeWidth={1.8} className={cn('size-5 min-h-5 min-w-5', className)} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
