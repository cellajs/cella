import { ArrowUpRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '~/modules/common/country-flag';
import { cards } from '~/modules/marketing/marketing-config';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/modules/ui/ui-store';

export interface InfoCard {
  name: string;
  url: string;
  invert?: boolean;
  id: string;
  country: string;
}

export function InfoCards() {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  return (
    <ScrollArea className="w-full" horizontalScroll>
      <div className="flex w-max space-x-4 px-2 py-8">
        {cards.map(({ url, id, name, invert, country }) => {
          const text = `about:cards.${id}.text`;
          const purpose = `about:cards.${id}.purpose`;

          return (
            <a
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              draggable={false}
              key={id}
              className="group focus-effect relative flex h-96 w-64 shrink-0 flex-col justify-between rounded-lg border p-5 hover:cursor-pointer hover:border-primary hover:ring-4 hover:ring-primary/10 active:translate-y-[.05rem] sm:w-80"
            >
              <div className="flex items-center space-x-2">
                <img
                  src={`/static/marketing/integrations/${id}.svg`}
                  alt={name}
                  className={`h-8 w-8 object-contain ${invert && mode === 'dark' && 'invert'}`}
                  loading="lazy"
                />
                <span className="ml-4 font-semibold">{name}</span>
              </div>
              <div className="grow overflow-hidden pt-4">{t(text)}</div>
              <div className="pt-2 text-sm">
                <div className="mb-2 text-muted-foreground">{t(purpose)}</div>
                <div className="font-semibold underline-offset-4 group-hover:underline">
                  <CountryFlag countryCode={country} className="mr-2" />
                  {url}
                  <ArrowUpRightIcon className="icon-xs -mt-2 ml-1 inline-block text-primary opacity-50 group-hover:opacity-100" />
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
