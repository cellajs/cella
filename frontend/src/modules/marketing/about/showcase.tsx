import { useTranslation } from 'react-i18next';
import { useInView } from '~/hooks/use-in-view';
import type { TKey } from '~/lib/i18n-locales';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { useCountUp } from '~/modules/marketing/about/counters';
import { DeviceMockup } from '~/modules/marketing/device-mockup';
import { ExternalArrow } from '~/modules/marketing/external-arrow';
import { showcaseItems } from '~/modules/marketing/marketing-config';

export interface ShowcaseItem {
  id: string;
  url: string;
  /** Lines of code from cella; with `totalLoc` set too, the item shows cella's share. */
  cellaLoc?: number;
  /** Lines of code of the whole app. */
  totalLoc?: number;
  lightItems: CarouselItemData[];
  darkItems: CarouselItemData[];
}

interface CellaShareProps {
  cellaLoc: number;
  totalLoc: number;
}

function CellaShare({ cellaLoc, totalLoc }: CellaShareProps) {
  const { t } = useTranslation();
  const { ref, inView } = useInView({ once: true });
  const percentage = Math.round((cellaLoc / totalLoc) * 100);
  const start = Math.floor(percentage / 2);
  const value = useCountUp(start, inView ? percentage : start);

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
    <div className="mx-auto mt-20 mb-12 flex max-w-3xl items-start gap-8 max-sm:flex-col lg:mb-16">
      <div className="flex w-full flex-col">
        {showcaseItems.map((item, index) => {
          const title = `about:showcase.title_${index + 1}` as TKey;
          const text = `about:showcase.text_${index + 1}` as TKey;

          return (
            <div key={item.id}>
              <h3 className="mt-4 mb-2 font-medium text-xl 2xl:text-[1.38rem]">
                <a href={item.url} target="_blank" rel="noreferrer" className="group/external-link link-inline focus-effect rounded-sm">
                  {t(title)}
                  <ExternalArrow />
                </a>
              </h3>
              <p className="mb-6 leading-relaxed sm:mb-12">{t(text)}</p>
              {item.cellaLoc && item.totalLoc && <CellaShare cellaLoc={item.cellaLoc} totalLoc={item.totalLoc} />}
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
