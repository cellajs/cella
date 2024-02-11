import { ArrowUpRight } from 'lucide-react';
import CountryFlag from '~/modules/common/country-flag';
import { ScrollArea, ScrollBar } from '~/modules/ui/scroll-area';

interface Integrations {
  name: string;
  purpose: string;
  planned: boolean;
  text: string;
  url: string;
  logo: string;
  country: string;
}

const integrations: Integrations[] = [
  {
    name: 'Hanko',
    purpose: 'Authentication',
    planned: true,
    text: 'Hanko is an open source passwordless authentication solution that allows you to integrate passkeys into your application.',
    country: 'DE',
    url: 'hanko.io',
    logo: 'hanko.svg',
  },
  {
    name: 'AppSignal',
    purpose: 'App monitoring',
    planned: false,
    text: 'AppSignal gives you error tracking, performance monitoring, host metrics and anomaly detection in one interface.',
    country: 'NL',
    url: 'appsignal.com',
    logo: 'appsignal.svg',
  },
  {
    name: 'n8n',
    purpose: 'Workflow automation',
    planned: false,
    text: 'n8n is an extendable workflow automation tool which enables you to connect anything to everything via its open, fair-code model.',
    country: 'DE',
    url: 'n8n.io',
    logo: 'n8n.svg',
  },
  {
    name: 'Gleap',
    purpose: 'Customer support',
    planned: true,
    text: 'Gleap is an all-in-one customer feedback tool. Live chat, customer satisfaction, public roadmap and more.',
    country: 'AT',
    url: 'gleap.io',
    logo: 'gleap.svg',
  },
  {
    name: 'Adyen',
    purpose: 'Payments',
    planned: true,
    text: 'Accept payments from all over the world, with 250+ payment methods and 187 currencies.',
    country: 'NL',
    url: 'adyen.com',
    logo: 'adyen.svg',
  },
  {
    name: 'Imado',
    purpose: 'File handling',
    planned: false,
    text: 'A simple image, video & file handling solution. Stored in your own S3 bucket. Secure or public access, image transformations and more.',
    country: 'NL',
    url: 'imado.eu',
    logo: 'imado.svg',
  },
  {
    name: 'SimpleAnalytics',
    purpose: 'Analytics',
    planned: true,
    text: 'Simple, clean, and privacy-friendly analytics. No cookies, no sessions, no tracking.',
    country: 'NL',
    url: 'simpleanalytics.com',
    logo: 'simpleanalytics.svg',
  },
  {
    name: 'Oh Dear',
    purpose: 'Status monitor',
    planned: true,
    text: 'Oh dear offers status and uptime pages and many ways to be informed about problems. It also scans the whole site for broken links or mixed content.',
    country: 'BE',
    url: 'ohdear.app',
    logo: 'ohdear.svg',
  },
  {
    name: 'TipTap',
    purpose: 'Text editor',
    planned: true,
    text: 'A rich text editor with real-time collaboration support and many more features.',
    country: 'DE',
    url: 'tiptap.dev',
    logo: 'tiptap.svg',
  },
];

const Integrations = () => {
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
              <img src={`/integrations/${integration.logo}`} alt={integration.name} className="h-10 w-10 object-contain" loading="lazy" />
              <span className="ml-4 font-medium">{integration.name}</span>
            </div>
            <div className="grow overflow-hidden text-sm pt-4">
              <span className="font-light">{integration.text}</span>
            </div>
            <div className="pt-2 text-xs">
              <div className="italic text-muted-foreground mb-2">{integration.purpose}</div>
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
