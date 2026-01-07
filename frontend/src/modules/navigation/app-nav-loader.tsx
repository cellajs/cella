import { useIsFetching } from '@tanstack/react-query';
import { appConfig } from 'config';
import { HomeIcon } from 'lucide-react';
import useMounted from '~/hooks/use-mounted';
import Logo from '~/modules/common/logo';
import { useNavigationStore } from '~/store/navigation';
import { cn } from '~/utils/cn';

/**
 * Navigation loader component shown during data fetching.
 */
const AppNavLoader = ({ className }: { className?: string }) => {
  const isFetching = useIsFetching({
    predicate: (query) => {
      if (query.meta === undefined || !('offlinePrefetch' in query.meta) || !query.meta.offlinePrefetch) return true;
      return false;
    },
  });
  const { hasWaited } = useMounted();

  const navLoading = useNavigationStore((state) => state.navLoading);

  const isLoading = isFetching > 0 || navLoading;

  return (
    <>
      <div
        className={cn(
          'absolute transition-all ease-in-out duration-300 group-hover:scale-110 group-hover:opacity-0',
          !isLoading && hasWaited ? 'opacity-0 scale-0' : 'opacity-100 scale-100 delay-150',
        )}
      >
        <Logo iconOnly className={cn(`w-8 saturate-[.9] ${appConfig.navLogoAnimation}`, className)} />
      </div>
      <HomeIcon
        strokeWidth={1.8}
        className={cn(
          `transition-all ease-in-out duration-300 group-hover:scale-110 size-5 min-h-5 min-w-5 group-hover:opacity-100 
                    ${!hasWaited && 'scale-0 opacity-0'} ${isLoading && 'scale-0 opacity-0'}`,
          className,
        )}
      />
    </>
  );
};

export default AppNavLoader;
