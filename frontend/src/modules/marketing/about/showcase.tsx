import { config } from 'config';
import { ArrowUpRight } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';

const DeviceMockup = lazy(() => import('~/modules/marketing/device-mockup'));

const showcaseItems = [{ id: 'raak', url: 'https://raak.dev' }];

// Slides for light and dark themes
const lightSlides = [
  { url: '/static/images/showcases/raak-1.png', contentType: 'image/png' },
  { url: '/static/images/showcases/raak-2.png', contentType: 'image/png' },
];
const darkSlides = [
  { url: '/static/images/showcases/raak-1-dark.png', contentType: 'image/png' },
  { url: '/static/images/showcases/raak-2-dark.png', contentType: 'image/png' },
];

const Showcase = () => {
  const { t } = useTranslation();

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
                    <a href={item.url} target="_blank" rel="noreferrer">
                      <h3 className="mb-2 text-xl group font-medium 2xl:text-[1.38rem]">
                        {t(title)}
                        <ArrowUpRight
                          size={16}
                          strokeWidth={config.theme.strokeWidth}
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
        <Suspense fallback={<Spinner className="mt-[40vh] h-10 w-10" />}>
          <DeviceMockup className="" type="mobile" lightSlides={lightSlides} darkSlides={darkSlides} />
        </Suspense>
      </div>
    </div>
  );
};

export default Showcase;
