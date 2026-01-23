import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';

interface MarketingLayoutProps {
  title: string;
  children?: React.ReactNode;
}

function MarketingLayout({ title, children }: MarketingLayoutProps) {
  const { t } = useTranslation();

  return (
    <div>
      <MarketingNav />
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <div className="max-w-none px-0">
          <section className="rich-gradient relative py-20 pb-8">
            <h1 className="mt-12 mb-4 max-w-2xl px-4 mx-auto sm:w-full text-4xl text-center md:text-5xl">{t(title)}</h1>
          </section>

          {children}
        </div>
        <MarketingFooter />
      </Suspense>
    </div>
  );
}

export default MarketingLayout;
