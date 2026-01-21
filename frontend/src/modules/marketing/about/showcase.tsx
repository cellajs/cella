import { appConfig } from 'config';
import { ArrowUpRightIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { showcaseItems } from '~/modules/marketing/marketing-config';

const DeviceMockup = lazy(() => import('~/modules/marketing/device-mockup'));

export type ShowcaseItem = {
  id: string;
  url: string;
  lightItems: { id: string; url: string; contentType: string }[];
  darkItems: { id: string; url: string; contentType: string }[];
};

function Showcase() {
  const { t } = useTranslation();

  const lightItems = showcaseItems.flatMap((item) => item.lightItems);
  const darkItems = showcaseItems.flatMap((item) => item.darkItems);

  return (
    <div className="mx-auto mb-12 mt-20 flex max-sm:flex-col gap-8 max-w-3xl items-center lg:mb-16 relative">
      <div className="w-full">
        <div className="flex flex-wrap">
          {showcaseItems.map((item, index) => {
            const title = `about:showcase.title_${index + 1}`;
            const text = `about:showcase.text_${index + 1}`;

            return (
              <div className="w-full" key={item.id}>
                <div className="flex">
                  <div className="w-full">
                    <a href={item.url} target="_blank" rel="noreferrer" className="rounded-md focus-effect block">
                      <h3 className="mb-2 text-xl group font-medium 2xl:text-[1.38rem]">
                        {t(title)}
                        <ArrowUpRightIcon
                          size={16}
                          strokeWidth={appConfig.theme.strokeWidth}
                          className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100"
                        />
                      </h3>
                    </a>
                    <p className="leading-relaxed">{t(text)}</p>
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
};

export default Showcase;
