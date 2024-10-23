import { config } from 'config';
import { Home } from 'lucide-react';
import Logo from '~/modules/common/logo';

import { useIsFetching } from '@tanstack/react-query';
import useMounted from '~/hooks/use-mounted';
import { useNavigationStore } from '~/store/navigation';

const MainNavLoader = () => {
  const { hasWaited } = useMounted();
  const { navLoading } = useNavigationStore();
  const isFetching = useIsFetching();

  const isLoading = isFetching > 0 || navLoading;
  return (
    <>
      <Logo
        iconOnly
        data-waited={hasWaited}
        data-loading={isLoading}
        className={`w-8 saturate-[.9] group-hover:scale-110 absolute transition-all group-hover:opacity-0 -z-0
          data-[loading=true]:${config.navLogoAnimation}
          data-[waited=true]:data-[loading=false]:ease-in-out  
          data-[waited=true]:data-[loading=false]:opacity-0
          data-[waited=true]:data-[loading=false]:scale-0`}
      />
      <Home
        data-waited={hasWaited}
        data-loading={isLoading}
        strokeWidth={config.theme.strokeWidth}
        className="transition-all ease-in-out group-hover:scale-110 group-hover:opacity-100 
        data-[waited=false]:scale-0
        data-[loading=true]:scale-0
        data-[waited=false]:opacity-0
        data-[loading=true]:opacity-0"
      />
    </>
  );
};

export default MainNavLoader;
