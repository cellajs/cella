import { useTranslation } from 'react-i18next';
import PublicPage from '~/modules/common/public-page';

const Accessibility = () => {
  const { t } = useTranslation();
  
  return (
    <PublicPage title={t('common:accessibility')}>
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-[48rem] min-h-screen px-4 md:px-8 font-light">
          <p>Accessibility statement here</p>
        </div>
      </section>
    </PublicPage>
  );
};

export default Accessibility;
