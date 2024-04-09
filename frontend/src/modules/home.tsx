import { SimpleHeader } from '~/modules/common/simple-header';
import Onboarding from './common/onboarding';
import { Button } from '~/modules/ui/button';
import { config } from 'config';
import { dialog } from '~/modules/common/dialoger/state';
import { useTranslation } from 'react-i18next';

const Home = () => {
  const { t } = useTranslation();

  const showOnboarding = () => {
    dialog(<Onboarding />, {
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75',
    });
  };
  return (
    <>
      <SimpleHeader heading="common:home" text="common:home.text" className="container" />
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center">{t('common:under_construction.text')}</div>

        {config.has.onboarding && (
          <div className="mt-8 text-center">
            <Button onClick={showOnboarding}>Show Onboarding WIP</Button>
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
