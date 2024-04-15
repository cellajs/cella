import { Suspense, lazy, useEffect } from 'react';
import useMounted from '~/hooks/use-mounted';
import { dialog } from '~/modules/common/dialoger/state';

const Onboarding = lazy(() => import('~/modules/home/onboarding'));

const Welcome = () => {
  const { hasMounted } = useMounted();
  const showOnboarding = () => {
    dialog(
      <Suspense>
        <Onboarding />
      </Suspense>,
      {
        drawerOnMobile: false,
        className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75',
      },
    );
  };

  useEffect(() => {
    if (hasMounted) showOnboarding();
  }, [hasMounted]);

  return <></>;
};

export default Welcome;
