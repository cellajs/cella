import { useIsFetching } from '@tanstack/react-query';
import { appConfig } from 'config';
import { HomeIcon } from 'lucide-react';
import useMounted from '~/hooks/use-mounted';
import Logo from '~/modules/common/logo';
import { useNavigationStore } from '~/store/navigation';

const AppNavLoader = () => {
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
      <Logo
        iconOnly
        className={`w-8 saturate-[.9] group-hover:scale-110 absolute transition-all group-hover:opacity-0 -z-0
                    ${appConfig.navLogoAnimation} ${!isLoading && hasWaited && 'ease-in-out opacity-0 scale-0'}`}
      />
      <HomeIcon
        strokeWidth={appConfig.theme.strokeWidth}
        className={`transition-all ease-in-out group-hover:scale-110 group-hover:opacity-100 
                    ${!hasWaited && 'scale-0 opacity-0'} ${isLoading && 'scale-0 opacity-0'}`}
      />
    </>
  );
};

export default AppNavLoader;
