import { config } from 'config';
import { HomeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { SimpleHeader } from '~/modules/common/simple-header';

const Home = () => {
  const { t } = useTranslation();

  return (
    <div className="px-3 md:px-6">
      <SimpleHeader heading={t('common:home')} text={t('common:home.text', { appName: config.name })} className="container pt-4 md:pt-6" />
      <ContentPlaceholder Icon={HomeIcon} title="Home page" text="You can put home page content here" />
    </div>
  );
};

export default Home;
