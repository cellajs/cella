import { config } from 'config';
import { Home } from 'lucide-react';
import { useEffect } from 'react';
import useAppState from '~/hooks/use-app-state';
import router from '~/router';
import { useNavigationStore } from '~/store/navigation';
import Logo from './logo';

const HomeIconLoader = () => {
  const { isReady } = useAppState();
  const { navLoading, setLoading } = useNavigationStore();

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged }) => {
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
        className={`${navLoading && 'animate-spin-slow'} w-8 saturate-[.9] group-hover:scale-110 absolute transition-all group-hover:opacity-0 -z-0 ${
          isReady && !navLoading && 'ease-in-out opacity-0 scale-0'
        }`}
      />
      <Home
        strokeWidth={config.theme.strokeWidth}
        className={`transition-all ease-in-out group-hover:scale-110 group-hover:opacity-100 ${!isReady || navLoading ? 'opacity-0 scale-0' : ''}`}
      />
    </>
  );
};

export default HomeIconLoader;
