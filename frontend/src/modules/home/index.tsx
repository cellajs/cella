import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';
import { SimpleHeader } from '~/modules/common/simple-header';
import { EntityInvites } from '~/modules/me/entity-invitations';

const Home = () => {
  const { t } = useTranslation();

  return (
    <div className="px-3 md:px-6">
      <SimpleHeader heading={t('common:home')} text={t('common:home.text', { appName: appConfig.name })} className="container pt-4 md:pt-6" />
      <EntityInvites cardClassName="mt-6" placeholderClassName="mt-[40vh]" />
    </div>
  );
};

export default Home;
