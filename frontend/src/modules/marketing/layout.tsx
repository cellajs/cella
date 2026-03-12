import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '~/modules/common/spinner';
import { BackgroundCurve } from '~/modules/marketing/about/hero';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';

interface MarketingLayoutProps {
  title: string;
  children?: React.ReactNode;
}

/**
 * Layout component for marketing pages, providing a consistent structure with navigation, header, and footer.
 */
export function MarketingLayout({ title, children }: MarketingLayoutProps) {
  const { t } = useTranslation();

  return (
    <div>
      <MarketingNav />
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <div className="max-w-none px-0">
          <section className="rich-gradient relative py-20 pb-16">
            <h1 className="mt-12 mb-4 max-w-2xl px-4 mx-auto sm:w-full text-4xl text-center md:text-5xl">{t(title)}</h1>
            <BackgroundCurve height="clamp(1.5rem, 4vw, 3rem)" />
          </section>

          {children}
        </div>
        <MarketingFooter />
      </Suspense>
    </div>
  );
}
