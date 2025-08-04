import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CountryFlag from '~/modules/common/country-flag';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';
import { useUIStore } from '~/store/ui';
import { integrations } from '~/modules/marketing/marketing-config';

export interface Integration {
  name: string;
  planned?: boolean;
  url: string;
  invert?: boolean;
  id: string;
  country: string;
}

const Integrations = () => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);

  return (
    <ScrollArea className="w-full" orientation="horizontal" size="defaultHorizontal">
      <div className="flex w-max space-x-4 py-8 px-2">
        {integrations.map(({ planned, url, id, name, invert, country }) => {
          const text = `about:integrations.${id}_text`;
          const purpose = `about:integrations.${id}_purpose`;

          return (
            <a
              href={`https://${url}`}
              target="_blank"
              rel="noreferrer"
              draggable="false"
              key={id}
              className="flex h-96 w-64 group relative shrink-0 flex-col justify-between rounded-lg border p-5 hover:cursor-pointer hover:border-primary hover:ring-4 hover:ring-primary/10 focus-effect"
            >
              {planned && (
                <div className="absolute top-0 right-0 bg-foreground/25 text-white text-xs px-2 py-1 rounded-tr-md rounded-bl-md">Planned</div>
              )}
              <div className="flex items-center space-x-2">
                <img
                  src={`/static/images/integrations/${id}.svg`}
                  alt={name}
                  className={`h-8 w-8 object-contain ${invert && mode === 'dark' && 'invert'}`}
                  loading="lazy"
                />
                <span className="ml-4 font-medium">{name}</span>
              </div>
              <div className="grow overflow-hidden text-sm pt-4">
                <span className="font-light">{t(text)}</span>
              </div>
              <div className="pt-2 text-xs">
                <div className="italic text-muted-foreground mb-2">{t(purpose)}</div>
                <div className="text-muted-foreground font-semibold group-hover:underline underline-offset-4">
                  <CountryFlag countryCode={country} className="mr-2" />
                  {url}
                  <ArrowUpRight size={12} className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100" />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <ScrollBar orientation="horizontal" size="defaultHorizontal" />
    </ScrollArea>
  );
};

export default Integrations;
