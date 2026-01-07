import { useTranslation } from 'react-i18next';
import MarketingLayout from '~/modules/marketing/layout';
import { LegalContent } from '~/modules/marketing/legal/legal-content';

/**
 * Legal page showing core legal texts (privacy policy, terms of use) with sidebar navigation.
 */
export const LegalPage = () => {
  const { t } = useTranslation();

  return (
    <MarketingLayout title={t('common:legal')}>
      <LegalContent />
    </MarketingLayout>
  );
};
