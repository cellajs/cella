import { useIsFetching } from '@tanstack/react-query';
import { config } from 'config';
import { Home } from 'lucide-react';
import useMounted from '~/hooks/use-mounted';
import Logo from '~/modules/app/logo';
import { useNavigationStore } from '~/store/navigation';

const MainNavLoader = () => {
  const { hasWaited } = useMounted();
  const { navLoading } = useNavigationStore();
  const isFetching = useIsFetching();

  // Show loading spinner when fetching data or navigating
  const isLoading = isFetching > 0 || navLoading;

  return (
    <>
      <Logo
        iconOnly
        className={`${isLoading && config.navLogoAnimation} w-8 saturate-[.9] group-hover:scale-110 absolute transition-all group-hover:opacity-0 -z-0 ${
          hasWaited && !isLoading && 'ease-in-out opacity-0 scale-0'
        }`}
      />
      <Home
        strokeWidth={config.theme.strokeWidth}
        className={`transition-all ease-in-out group-hover:scale-110 group-hover:opacity-100 ${!hasWaited || isLoading ? 'opacity-0 scale-0' : ''}`}
      />
    </>
  );
};

export default MainNavLoader;
