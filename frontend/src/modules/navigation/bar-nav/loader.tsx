import { config } from 'config';
import { Home } from 'lucide-react';
import Logo from '~/modules/common/logo';

import { useIsFetching } from '@tanstack/react-query';
import useMounted from '~/hooks/use-mounted';
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
                    ${config.navLogoAnimation} ${!isLoading && hasWaited && 'ease-in-out opacity-0 scale-0'}`}
      />
      <Home
        strokeWidth={config.theme.strokeWidth}
        className={`transition-all ease-in-out group-hover:scale-110 group-hover:opacity-100 
                    ${!hasWaited && 'scale-0 opacity-0'} ${isLoading && 'scale-0 opacity-0'}`}
      />
    </>
  );
};

export default AppNavLoader;
