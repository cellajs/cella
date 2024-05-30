import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import { AppAlert } from '../common/app-alert';

const Home = () => {
  const { t } = useTranslation();

  return (
    <>
      <AppAlert variant="plain" id="skip_org_creation" className="rounded-none">
        {t('common:explain.skip_org_creation.text')}
      </AppAlert>
      <SimpleHeader heading={t('common:home')} text={t('common:home.text', { appName: config.name })} className="container pt-4 md:pt-6" />
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center max-w-2xl mx-auto">
          <p>{t('common:under_construction.text', { appName: config.name })}</p>
        </div>
      </div>
    </>
  );
};

export default Home;
