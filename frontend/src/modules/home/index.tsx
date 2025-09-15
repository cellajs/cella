import { appConfig } from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getContextEntities } from '~/api.gen';
import { SimpleHeader } from '~/modules/common/simple-header';
import { EntityInvites } from '~/modules/me/entity-invitations';
import { useAlertStore } from '~/store/alert';
import { useUserStore } from '~/store/user';

const Home = () => {
  const { t } = useTranslation();
  const { setDownAlert } = useAlertStore();

  useEffect(() => {
    (async () => {
      getContextEntities();
    })();

    const { user } = useUserStore.getState();
    if (user.role === 'admin' && !user.mfaRequired && appConfig.mode === 'production') setDownAlert('enable_mfa');
  }, []);
  return (
    <div className="px-3 md:px-6">
      <SimpleHeader heading={t('common:home')} text={t('common:home.text', { appName: appConfig.name })} className="container pt-4 md:pt-6" />
      <EntityInvites />
    </div>
  );
};

export default Home;
