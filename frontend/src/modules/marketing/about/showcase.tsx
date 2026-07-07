import { ArrowUpRightIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useInView } from 'react-intersection-observer';
import { appConfig } from 'shared';
import { Spinner } from '~/modules/common/spinner';
import { useCountUp } from '~/modules/marketing/about/counters';
import { showcaseItems } from '~/modules/marketing/marketing-config';
import { lazyNamed } from '~/utils/lazy-named';

const DeviceMockup = lazyNamed(() => import('~/modules/marketing/device-mockup'), 'DeviceMockup');

export type ShowcaseItem = {
  id: string;
  url: string;
  cellaLoc?: number;
  totalLoc?: number;
  lightItems: { id: string; url: string; contentType: string }[];
  darkItems: { id: string; url: string; contentType: string }[];
};

function CellaShare({ cellaLoc, totalLoc }: { cellaLoc: number; totalLoc: number }) {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });
  const percentage = Math.round((cellaLoc / totalLoc) * 100);
  const value = useCountUp(0, inView ? percentage : 0);

  return (
    <div ref={ref} className="text-left">
      <div className="font-medium text-8xl text-primary">{value}%</div>
      <div className="text-muted-foreground">{t('about:showcase.from_cella')}</div>
    </div>
  );
}

export function Showcase() {
  const { t } = useTranslation();

  const lightItems = showcaseItems.flatMap((item) => item.lightItems);
  const darkItems = showcaseItems.flatMap((item) => item.darkItems);

  return (
    <div className="relative mx-auto mt-20 mb-12 flex max-w-3xl items-start gap-8 max-sm:flex-col lg:mb-16">
      <div className="w-full">
        <div className="flex flex-wrap">
          {showcaseItems.map((item, index) => {
            const title = `about:showcase.title_${index + 1}`;
            const text = `about:showcase.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="flex">
                  <div className="w-full">
                    <a href={item.url} target="_blank" rel="noreferrer" className="focus-effect mt-4 block rounded-md">
                      <h3 className="group mb-2 font-medium text-xl 2xl:text-[1.38rem]">
                        {t(title)}
                        <ArrowUpRightIcon
                          size={16}
                          strokeWidth={appConfig.theme.strokeWidth}
                          className="-mt-2 ml-1 inline-block text-primary opacity-50 group-hover:opacity-100"
                        />
                      </h3>
                    </a>
                    <p className="mb-6 leading-relaxed sm:mb-12">{t(text)}</p>
                    {item.cellaLoc && item.totalLoc && <CellaShare cellaLoc={item.cellaLoc} totalLoc={item.totalLoc} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="">
        <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
          <DeviceMockup className="" type="mobile" lightItems={lightItems} darkItems={darkItems} />
        </Suspense>
      </div>
    </div>
  );
}
