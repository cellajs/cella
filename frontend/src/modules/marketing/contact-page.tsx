import { CalendarCheckIcon, MailIcon, MapPinIcon, PhoneCallIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { ContactForm } from '~/modules/common/contact-form/contact-form';
import type { IconComponent } from '~/modules/common/icons/types';
import { ExternalArrow } from '~/modules/marketing/external-arrow';
import { MarketingLayout } from '~/modules/marketing/layout';

interface ContactMethod {
  icon: IconComponent;
  title: TKey;
  link: string;
  /** Link text as a translation key; wins over `text`. */
  textKey?: TKey;
  text?: string;
}

const methods: ContactMethod[] = [
  { icon: MapPinIcon, title: 'c:visit', link: appConfig.company.directionsUrl, text: appConfig.company.streetAddress },
  { icon: MailIcon, title: 'c:email', link: `mailto:${appConfig.company.email}`, text: appConfig.company.email },
];

if (appConfig.company.scheduleCallUrl)
  methods.push({ icon: CalendarCheckIcon, title: 'c:book', link: appConfig.company.scheduleCallUrl, textKey: 'c:schedule_call' });
if (appConfig.company.tel) methods.push({ icon: PhoneCallIcon, title: 'c:call', link: `tel:${appConfig.company.tel}`, text: appConfig.company.tel });

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout title="c:contact_us">
      <div className="container pt-20 pb-16">
        <h2 className="mb-4 text-2xl font-semibold sm:text-3xl md:text-4xl">{t('c:leave_message')}</h2>
        <p className="text-muted-foreground mb-8 sm:text-lg">{t('c:contact_us.text')}</p>
        <ContactForm />
      </div>
      <div className="container mb-12">
        {/* Framed rows on phones, where the link covers its row; a grid of circles from sm up */}
        <ul className="divide-y rounded-lg border sm:flex sm:flex-wrap sm:justify-evenly sm:gap-2 sm:divide-y-0 sm:rounded-none sm:border-0">
          {methods.map((method) => {
            // The mail and phone links hand over to an app, which needs no tab
            const isWebPage = method.link.startsWith('http');
            return (
              <li key={method.title} className="relative flex items-center gap-3 px-3 py-2.5 sm:mb-10 sm:block sm:h-48 sm:w-48 sm:p-0 sm:text-center">
                <div className="bg-accent/50 text-primary flex size-10 shrink-0 items-center justify-center rounded-full sm:mx-auto sm:mb-5 sm:size-32">
                  <method.icon className="size-5 stroke-[1.5] sm:size-12 sm:stroke-1" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold sm:mb-3 sm:text-lg">{t(method.title)}</h3>
                  <p>
                    <a
                      href={method.link}
                      className="group/external-link focus-effect text-muted-foreground sm:link-inline sm:text-foreground rounded-md text-sm max-sm:before:absolute max-sm:before:inset-0 sm:p-0.5 sm:text-base"
                      target={isWebPage ? '_blank' : undefined}
                      rel={isWebPage ? 'noreferrer' : undefined}
                    >
                      {method.textKey ? t(method.textKey) : method.text}
                      <ExternalArrow />
                    </a>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </MarketingLayout>
  );
}
