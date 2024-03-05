import { useTranslation } from 'react-i18next';
import PublicPage from '~/modules/common/public-page';

export const TermsText = () => {
  return <p>Put terms here</p>;
};

export const Terms = () => {
  const { t } = useTranslation();

  return (
    <PublicPage title={t('common:terms_of_use')}>
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-[48rem] font-light px-4 md:px-8 min-h-screen">
          <TermsText />
        </div>
      </section>
    </PublicPage>
  );
};
