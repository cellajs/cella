import { ArrowUpRightIcon, CalendarCheckIcon, MailIcon, MapPinIcon, PhoneCallIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { ContactForm } from '~/modules/common/contact-form/contact-form';
import { MarketingLayout } from '~/modules/marketing/layout';

const methods = [
  {
    icon: MapPinIcon,
    title: 'c:visit',
    link: appConfig.company.googleMapsUrl,
    text: appConfig.company.streetAddress,
  },
  { icon: MailIcon, title: 'c:email', link: `mailto:${appConfig.company.email}`, text: appConfig.company.email },
];

if (appConfig.company.scheduleCallUrl)
  methods.push({
    icon: CalendarCheckIcon,
    title: 'c:book',
    link: appConfig.company.scheduleCallUrl,
    text: 'c:schedule_call.text',
  });
if (appConfig.company.tel)
  methods.push({
    icon: PhoneCallIcon,
    title: 'c:call',
    link: `tel:${appConfig.company.tel}`,
    text: appConfig.company.tel,
  });

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <MarketingLayout title="c:contact_us">
      <div className="container pt-20 pb-16">
        <h1 className="mb-4 text-center font-semibold text-3xl sm:text-left md:text-4xl">
          {t('c:leave_message.text')}
        </h1>
        <p className="mb-8 text-center text-muted-foreground sm:text-left sm:text-lg">{t('c:contact_us.text')}</p>
        <ContactForm />
      </div>
      <div className="container mb-12">
        <div className="flex flex-wrap justify-evenly gap-2">
          {methods.map((method) => (
            <div key={t(method.title)} className="mb-10 h-48 w-40 text-center sm:w-48">
              <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-accent/50 text-primary sm:h-32 sm:w-32">
                <method.icon className="size-12" strokeWidth={1} />
              </div>
              <div className="text-center">
                <h4 className="mb-3 font-semibold text-lg">{t(method.title)}</h4>
                <p>
                  <a
                    href={method.link}
                    className="group focus-effect rounded-md p-0.5 text-sm underline-offset-4 hover:underline sm:text-base"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(method.text)}
                    <ArrowUpRightIcon className="-mt-2 ml-1 inline-block text-primary opacity-50 group-hover:opacity-100" />
                  </a>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
}
