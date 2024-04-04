import { useTranslation } from 'react-i18next';
import PublicPage from '~/modules/marketing/page';

export const PrivacyText = () => {
  return <p>Put privacy statement here</p>;
};

export const Privacy = () => {
  const { t } = useTranslation();

  return (
    <PublicPage title={t('common:privacy_policy')}>
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-[48rem] px-4 md:px-8 font-light min-h-screen">
          <PrivacyText />
        </div>
      </section>
    </PublicPage>
  );
};
