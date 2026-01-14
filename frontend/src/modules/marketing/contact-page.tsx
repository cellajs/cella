import { appConfig } from 'config';
import { ArrowUpRightIcon, CalendarCheckIcon, MailIcon, MapPinIcon, PhoneCallIcon } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import ContactFormMap from '~/modules/common/contact-form/contact-form';
import MarketingLayout from '~/modules/marketing/layout';

const methods = [
  {
    icon: MapPinIcon,
    title: 'common:visit',
    link: appConfig.company.googleMapsUrl,
    text: appConfig.company.streetAddress,
  },
  { icon: MailIcon, title: 'common:email', link: `mailto:${appConfig.company.email}`, text: appConfig.company.email },
];

if (appConfig.company.scheduleCallUrl)
  methods.push({
    icon: CalendarCheckIcon,
    title: 'common:book',
    link: appConfig.company.scheduleCallUrl,
    text: 'common:schedule_call.text',
  });
if (appConfig.company.tel)
  methods.push({
    icon: PhoneCallIcon,
    title: 'common:call',
    link: `tel:${appConfig.company.tel}`,
    text: appConfig.company.tel,
  });

const ContactPage = () => {
  const { t } = useTranslation();

  return (
    <MarketingLayout title="common:contact_us">
      <div className="container pb-16 pt-20">
        <h1 className="mb-4 text-3xl font-semibold text-center sm:text-left md:text-4xl">
          {t('common:leave_message.text')}
        </h1>
        <p className="mb-8 text-muted-foreground text-center sm:text-left sm:text-lg">{t('common:contact_us.text')}</p>
        <ContactFormMap />
      </div>
      <div className="container mb-12">
        <div className="flex flex-wrap justify-evenly gap-2">
          {methods.map((method) => (
            <div key={t(method.title)} className="mb-10 text-center h-48 w-40 sm:w-48">
              <div className="text-primary mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-accent/50 sm:h-32 sm:w-32">
                <method.icon size={48} strokeWidth={1} />
              </div>
              <div className="text-center">
                <h4 className="mb-3 text-lg font-semibold">{t(method.title)}</h4>
                <p>
                  <a
                    href={method.link}
                    className="hover:underline underline-offset-4 text-sm sm:text-base group p-0.5 rounded-md focus-effect"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(method.text)}
                    <ArrowUpRightIcon
                      size={16}
                      strokeWidth={appConfig.theme.strokeWidth}
                      className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100"
                    />
                  </a>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MarketingLayout>
  );
};

export default ContactPage;
