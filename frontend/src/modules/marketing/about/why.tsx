import { Link } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Spinner } from '~/modules/common/spinner';
import { whyDarkSlides, whyItems, whyLightSlides } from '~/modules/marketing/marketing-config';
import { lazyNamed } from '~/utils/lazy-named';

const DeviceMockup = lazyNamed(() => import('~/modules/marketing/device-mockup'), 'DeviceMockup');
export function Why() {
  const { t } = useTranslation();

  return (
    <div className="relative mx-auto mt-12 mb-12 flex max-w-7xl flex-wrap items-center lg:mt-16 lg:mb-16">
      <div className="w-full lg:w-5/12">
        <div className="flex flex-wrap">
          {whyItems.map((item, index) => {
            const title = `about:why.title_${index + 1}`;
            const text = `about:why.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="group mb-12 flex">
                  <div className="mr-4 flex h-8 w-full max-w-8 items-center justify-center rounded-full border-2 border-primary font-semibold text-l group-hover:bg-transparent md:-mt-2 md:h-12 md:max-w-12 md:text-1xl">
                    {index + 1}
                  </div>
                  <div className="w-full">
                    <h3 className="mb-2 font-medium text-xl 2xl:text-[1.38rem]">{t(title)}</h3>
                    <p className="leading-relaxed">
                      <Trans
                        t={t}
                        i18nKey={text}
                        components={{
                          featuresLink: (
                            <Link to="/features" className="underline underline-offset-4 hover:text-primary" />
                          ),
                          syncEngineLink: (
                            <Link to="/sync-engine" className="underline underline-offset-4 hover:text-primary" />
                          ),
                        }}
                      />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-full lg:w-7/12">
        <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
          <DeviceMockup
            className="-top-2 lg:relative lg:ml-8 lg:w-[54vw]"
            type="pc"
            lightItems={whyLightSlides}
            darkItems={whyDarkSlides}
          />
        </Suspense>
      </div>
    </div>
  );
}
