import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Spinner } from '~/modules/common/spinner';
import { BackgroundCurve } from '~/modules/marketing/background-curve';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';

interface MarketingLayoutProps {
  /** i18n key or already-translated text (t() renders non-keys verbatim). */
  title?: string;
  children?: React.ReactNode;
}

export function MarketingLayout({ title, children }: MarketingLayoutProps) {
  const { t } = useTranslation();

  return (
    <>
      <MarketingNav />
      <Suspense fallback={<Spinner size="lg" className="mt-[45vh]" />}>
        <main>
          {/* Gradient keeps the hero's height, centered and clipped, so a short header shows its middle instead of a squashed copy */}
          <section className="rich-gradient relative overflow-hidden pt-14 pb-16 after:top-1/2 after:h-[max(100%,90vh)] after:-translate-y-1/2 sm:min-h-40 sm:py-20">
            {title && <h1 className="mx-auto mt-12 mb-4 max-w-2xl px-4 text-center font-semibold text-4xl md:text-5xl">{t(title as TKey)}</h1>}
            <BackgroundCurve height="clamp(1.5rem, 4vw, 3rem)" />
          </section>

          {children}
        </main>
        <MarketingFooter />
      </Suspense>
    </>
  );
}
