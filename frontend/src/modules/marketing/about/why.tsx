import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { whyDarkSlides, whyItems, whyLightSlides } from '~/modules/marketing/marketing-config';

const DeviceMockup = lazy(() => import('~/modules/marketing/device-mockup'));
const Why = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto mb-12 mt-20 flex max-w-7xl flex-wrap items-center lg:mb-16 relative">
      <div className="w-full lg:w-5/12">
        <div className="flex flex-wrap">
          {whyItems.map((item, index) => {
            const title = `about:why.title_${index + 1}`;
            const text = `about:why.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="group mb-12 flex">
                  <div className="border-primary text-l md:text-1xl mr-4 flex h-8 w-full max-w-8 items-center justify-center rounded-full border-2 font-semibold group-hover:bg-transparent md:-mt-2 md:h-12 md:max-w-12">
                    {index + 1}
                  </div>
                  <div className="w-full">
                    <h3 className="mb-2 text-xl font-medium 2xl:text-[1.38rem]">{t(title)}</h3>
                    <p className="leading-relaxed">{t(text)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-full lg:w-7/12">
        <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
          <DeviceMockup className="lg:relative -top-2 lg:ml-8 lg:w-[54vw]" type="pc" lightItems={whyLightSlides} darkItems={whyDarkSlides} />
        </Suspense>
      </div>
    </div>
  );
};

export default Why;
