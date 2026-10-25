import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { CountryFlag } from '~/modules/common/country-flag';
import { ExternalArrow } from '~/modules/marketing/external-arrow';
import { cards } from '~/modules/marketing/marketing-config';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

export interface InfoCard {
  name: string;
  /** Host without protocol: the link adds `https://`, the card shows it as is. */
  url: string;
  /** Inverts the logo in dark mode. */
  invert?: boolean;
  id: string;
  country: string;
}

export function InfoCards() {
  const { t } = useTranslation();

  return (
    <ScrollArea className="w-full" horizontalScroll>
      <div className="flex w-max gap-4 px-2 py-8">
        {cards.map(({ url, id, name, invert, country }) => {
          const text = `about:cards.${id}.text` as TKey;
          const purpose = `about:cards.${id}.purpose` as TKey;

          return (
            <a
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              draggable={false}
              key={id}
              className="group/external-link focus-effect active:press flex h-96 w-64 shrink-0 flex-col rounded-lg border p-5 hover:border-primary hover:ring-4 hover:ring-primary/10 sm:w-80"
            >
              <div className="flex items-center gap-2">
                <img
                  src={`/static/marketing/integrations/${id}.svg`}
                  alt={name}
                  className={cn('size-8 object-contain', invert && 'dark:invert')}
                  loading="lazy"
                  draggable={false}
                />
                <span className="ml-4 font-semibold">{name}</span>
              </div>
              <div className="grow overflow-hidden pt-4">{t(text)}</div>
              <div className="pt-2 text-sm">
                <div className="mb-2 text-muted-foreground">{t(purpose)}</div>
                <div className="link-decoration group-active/external-link:link-decoration-strong font-semibold group-hover/external-link:underline">
                  <CountryFlag countryCode={country} className="mr-2" />
                  {url}
                  <ExternalArrow className="size-3" />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
