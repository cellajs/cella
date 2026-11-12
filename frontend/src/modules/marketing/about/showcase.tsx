import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { ExternalArrow } from '~/modules/common/external-arrow';
import { DeviceMockup } from '~/modules/marketing/device-mockup';
import { showcaseItems } from '~/modules/marketing/marketing-config';

export interface ShowcaseItem {
  id: string;
  url: string;
  lightItems: CarouselItemData[];
  darkItems: CarouselItemData[];
}

export function Showcase() {
  const { t } = useTranslation();

  const lightItems = showcaseItems.flatMap((item) => item.lightItems);
  const darkItems = showcaseItems.flatMap((item) => item.darkItems);

  return (
    <div className="mx-auto mt-20 mb-12 flex max-w-3xl items-start gap-8 max-sm:flex-col lg:mb-16">
      <div className="flex w-full flex-col">
        {showcaseItems.map((item, index) => {
          const title = `about:showcase.title_${index + 1}` as TKey;
          const text = `about:showcase.text_${index + 1}` as TKey;

          return (
            <div key={item.id}>
              <h3 className="mt-4 mb-2 text-xl font-medium 2xl:text-[1.38rem]">
                <a href={item.url} target="_blank" rel="noreferrer" className="group/external-link link-inline focus-effect rounded-sm">
                  {t(title)}
                  <ExternalArrow />
                </a>
              </h3>
              <p className="mb-6 leading-relaxed sm:mb-12">{t(text)}</p>
            </div>
          );
        })}
      </div>
      <div>
        <DeviceMockup type="mobile" lightItems={lightItems} darkItems={darkItems} />
      </div>
    </div>
  );
}
