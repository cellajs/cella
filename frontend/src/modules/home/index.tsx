import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import { AppAlert } from '../common/app-alert';
import { useUserStore } from '~/store/user';
import { useNavigate } from '@tanstack/react-router';

const Home = () => {
  const { t } = useTranslation();

  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();

  if (!user.emailVerified) {
    navigate({
      to: '/auth/verify-email',
      replace: true,
    });
  }
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
