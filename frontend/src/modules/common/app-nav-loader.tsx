import { useIsFetching } from '@tanstack/react-query';
import { config } from 'config';
import { Home } from 'lucide-react';
import { useEffect } from 'react';
import useMounted from '~/hooks/use-mounted';
import router from '~/lib/router';
import { useNavigationStore } from '~/store/navigation';
import Logo from './logo';
import { sheet } from './sheeter/state';

const AppNavLoader = () => {
  const { hasWaited } = useMounted();
  const { setSheet, navLoading, setLoading, setFocusView } = useNavigationStore();
  const isFetching = useIsFetching();

  // Show loading spinner when fetching data or navigating
  const isLoading = isFetching > 0 || navLoading;

  useEffect(() => {
    // TODO: move this to a more general location?
    router.subscribe('onBeforeLoad', ({ pathChanged, toLocation, fromLocation }) => {
      if (toLocation.pathname !== fromLocation.pathname) {

        // Disable focus view
        setFocusView(false);
        // Remove sheets in content
        sheet.remove();
        // Remove navigation sheet
        setSheet(null, 'routeChange');
      }
      pathChanged && setLoading(true);
    });
    router.subscribe('onLoad', () => {
      setLoading(false);
    });
  }, []);

  return (
    <>
      <Logo
        iconOnly
        className={`${isLoading && 'animate-spin-slow'} w-8 saturate-[.9] group-hover:scale-110 absolute transition-all group-hover:opacity-0 -z-0 ${
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

export default AppNavLoader;
