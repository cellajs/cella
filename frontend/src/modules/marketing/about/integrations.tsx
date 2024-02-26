import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CountryFlag from '~/modules/common/country-flag';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';

interface Integrations {
  name: string;
  purpose: string;
  planned: boolean;
  text: string;
  url: string;
  invert?: boolean,
  logo: string;
  country: string;
}

const integrations: Integrations[] = [
  {
    name: 'Hanko',
    purpose: 'common:integrations.purpose_1',
    planned: true,
    text: 'common:integrations.text_1',
    country: 'DE',
    url: 'hanko.io',
    logo: 'hanko.svg',
  },
  {
    name: 'AppSignal',
    purpose: 'common:integrations.purpose_2',
    invert: true,
    planned: false,
    text: 'common:integrations.text_2',
    country: 'NL',
    url: 'appsignal.com',
    logo: 'appsignal.svg',
  },
  {
    name: 'n8n',
    purpose: 'common:integrations.purpose_3',
    planned: false,
    text: 'common:integrations.text_3',
    country: 'DE',
    url: 'n8n.io',
    logo: 'n8n.svg',
  },
  {
    name: 'Paddle',
    purpose: 'common:integrations.purpose_5',
    planned: false,
    text: 'common:integrations.text_5',
    country: 'GB',
    url: 'paddle.com',
    logo: 'paddle.svg',
  },
  {
    name: 'Gleap',
    purpose: 'common:integrations.purpose_4',
    planned: true,
    text: 'common:integrations.text_4',
    country: 'AT',
    url: 'gleap.io',
    logo: 'gleap.svg',
  },
  {
    name: 'Imado',
    purpose: 'common:integrations.purpose_6',
    planned: false,
    text: 'common:integrations.text_6',
    country: 'NL',
    url: 'imado.eu',
    logo: 'imado.svg',
  },
  {
    name: 'SimpleAnalytics',
    purpose: 'common:integrations.purpose_7',
    planned: false,
    text: 'common:integrations.text_7',
    country: 'NL',
    url: 'simpleanalytics.com',
    logo: 'simpleanalytics.svg',
  },
  {
    name: 'Oh Dear',
    purpose: 'common:integrations.purpose_8',
    planned: true,
    text: 'common:integrations.text_8',
    country: 'BE',
    url: 'ohdear.app',
    logo: 'ohdear.svg',
  },
  {
    name: 'TipTap',
    purpose: 'common:integrations.purpose_9',
    planned: false,
    invert: true,
    text: 'common:integrations.text_9',
    country: 'DE',
    url: 'tiptap.dev',
    logo: 'tiptap.svg',
  },
];

const Integrations = () => {
  const { t } = useTranslation();
  
  return (
    <ScrollArea className="w-full">
      <div className="flex w-max space-x-4 py-8 px-2">
        {integrations.map((integration) => (
          <a
            href={`https://${integration.url}`}
            target="_blank"
            rel="noreferrer"
            key={integration.name}
            className="flex h-96 w-72 group relative shrink-0 flex-col justify-between rounded-lg border p-5 hover:cursor-pointer hover:border-primary hover:ring-4 hover:ring-primary/10"
          >
            {integration.planned && (
              <div className="absolute top-0 right-0 bg-foreground/25 text-white text-xs px-2 py-1 rounded-tr-md rounded-bl-md">TBD</div>
            )}
            <div className="flex items-center space-x-2">
              <img src={`/integrations/${integration.logo}`} alt={integration.name} className={`h-10 w-10 object-contain ${integration.invert && 'invert'}`} loading="lazy" />
              <span className="ml-4 font-medium">{integration.name}</span>
            </div>
            <div className="grow overflow-hidden text-sm pt-4">
              <span className="font-light">{t(integration.text)}</span>
            </div>
            <div className="pt-2 text-xs">
              <div className="italic text-muted-foreground mb-2">{t(integration.purpose)}</div>
              <div className="text-muted-foreground font-semibold group-hover:underline underline-offset-4">
                <CountryFlag countryCode={integration.country} className="mr-2" />
                {integration.url}
                <ArrowUpRight size={12} className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100" />
              </div>
            </div>
          </a>
        ))}
      </div>

      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};

export default Integrations;
