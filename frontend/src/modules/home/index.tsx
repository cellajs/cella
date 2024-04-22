import { Link } from '@tanstack/react-router';
import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';

const Home = () => {
  const { t } = useTranslation();

  return (
    <>
      <SimpleHeader heading={t('common:home')} text={t('common:home.text')} className="container pt-4 md:pt-6" />
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center max-w-2xl mx-auto">{t('common:under_construction.text')}</div>

        {config.has.onboarding && (
          <div className="mt-8 text-center">
            <Link to="/welcome">Show onboarding (in development)</Link>
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
