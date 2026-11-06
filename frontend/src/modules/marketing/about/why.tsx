import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { DeviceMockup } from '~/modules/marketing/device-mockup';
import { whyDarkSlides, whyItems, whyLightSlides } from '~/modules/marketing/marketing-config';

export function Why() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto my-12 flex max-w-7xl flex-wrap items-center lg:my-16">
      <div className="w-full lg:w-4/12">
        <div className="flex flex-wrap">
          {whyItems.map((item, index) => {
            const title = `about:why.title_${index + 1}` as TKey;
            const text = `about:why.text_${index + 1}` as TKey;

            return (
              <div className="w-full" key={item.id}>
                <div className="mb-12 flex items-baseline gap-5">
                  <span className="text-muted-foreground w-5 shrink-0 font-mono text-sm">{String(index + 1).padStart(2, '0')}</span>
                  <div className="w-full">
                    <h3 className="mb-2 text-xl font-medium 2xl:text-[1.38rem]">{t(title)}</h3>
                    <p className="leading-relaxed">
                      <Trans
                        t={t}
                        i18nKey={text as never}
                        components={{
                          featuresLink: <Link to="/features" className="link-inline hover:text-primary" />,
                          syncEngineLink: <Link to="/sync-engine" className="link-inline hover:text-primary" />,
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
      <div className="w-full lg:w-8/12 lg:pl-12">
        {/* The laptop runs past the window's right edge so the shots draw larger: the column plus the margin beside the
            max-w-7xl container (the section's px-4 up to 20rem) shows 86% of it, cutting 12% off the screen the pc frame
            draws 94% wide: (97% - 86%) / 94%. Past a 1920px window the margin stops counting and the cut shrinks below that. */}
        <DeviceMockup
          className="-top-2 w-[calc((100%+clamp(1rem,(100vw-80rem)/2,20rem))/0.86)] [--carousel-hidden-end:12%]"
          type="pc"
          lightItems={whyLightSlides}
          darkItems={whyDarkSlides}
        />
      </div>
    </div>
  );
}
