import { ArrowUpRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CountryFlag from '~/modules/common/country-flag';
import { cards } from '~/modules/marketing/marketing-config';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/store/ui';

export interface AboutCard {
  name: string;
  url: string;
  invert?: boolean;
  id: string;
  country: string;
}

function AboutCards() {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  return (
    <ScrollArea className="w-full">
      <div className="flex w-max space-x-4 py-8 px-2">
        {cards.map(({ url, id, name, invert, country }) => {
          const text = `about:cards.${id}_text`;
          const purpose = `about:cards.${id}_purpose`;

          return (
            <a
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              draggable="false"
              key={id}
              className="flex h-96 w-64 sm:w-80 group relative shrink-0 flex-col justify-between rounded-lg border p-5 hover:cursor-pointer hover:border-primary hover:ring-4 hover:ring-primary/10 focus-effect active:translate-y-[.05rem]"
            >
              <div className="flex items-center space-x-2">
                <img
                  src={`/static/images/integrations/${id}.svg`}
                  alt={name}
                  className={`h-8 w-8 object-contain ${invert && mode === 'dark' && 'invert'}`}
                  loading="lazy"
                />
                <span className="ml-4 font-semibold">{name}</span>
              </div>
              <div className="grow overflow-hidden pt-4">{t(text)}</div>
              <div className="pt-2 text-sm">
                <div className="text-muted-foreground mb-2">{t(purpose)}</div>
                <div className="font-semibold group-hover:underline underline-offset-4">
                  <CountryFlag countryCode={country} className="mr-2" />
                  {url}
                  <ArrowUpRightIcon
                    size={12}
                    className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100"
                  />
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

export default AboutCards;
