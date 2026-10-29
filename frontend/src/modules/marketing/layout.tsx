import { type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Spinner } from '~/modules/common/spinner';
import { BackgroundCurve } from '~/modules/marketing/background-curve';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';

interface MarketingLayoutProps {
  title?: TKey;
  children?: ReactNode;
}

export function MarketingLayout({ title, children }: MarketingLayoutProps) {
  const { t } = useTranslation();

  return (
    <>
      <MarketingNav />
      <Suspense fallback={<Spinner size="lg" className="mt-[45vh]" />}>
        <main>
          {/* The gradient keeps the hero's height, centered and clipped: a short header shows its middle, unsquashed */}
          <section className="rich-gradient relative overflow-hidden pt-14 pb-16 after:top-1/2 after:h-[max(100%,90vh)] after:-translate-y-1/2 sm:min-h-40 sm:py-20">
            {/* A half-opaque halo of the page background clears the gradient behind the title without blanking it */}
            {title && (
              <h1 className="relative z-1 mx-auto mt-12 mb-4 max-w-2xl px-4 text-center font-semibold text-4xl before:absolute before:-inset-x-24 before:-inset-y-16 before:-z-1 before:rounded-full before:bg-background/50 before:blur-3xl md:text-5xl">
                {t(title)}
              </h1>
            )}
            <BackgroundCurve height="clamp(1.5rem, 4vw, 3rem)" />
          </section>

          {children}
        </main>
        <MarketingFooter />
      </Suspense>
    </>
  );
}
