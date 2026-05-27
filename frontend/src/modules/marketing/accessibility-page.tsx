import { useTranslation } from 'react-i18next';
import { MarketingLayout } from '~/modules/marketing/layout';

export function AccessibilityPage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout title={t('c:accessibility')}>
      <section className="bg-background py-16">
        <div className="mx-auto min-h-screen max-w-3xl px-4 md:px-8">
          <p>Accessibility statement here</p>
        </div>
      </section>
    </MarketingLayout>
  );
}
