import { config } from 'config';
import { ArrowUpRight, CalendarCheck, Mail, MapPin, PhoneCall } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import ContactFormMap from '~/modules/common/contact-form/contact-form';
import PublicPage from '~/modules/common/public-page';

const methods = [
  { icon: MapPin, title: 'common:visit', link: config.company.googleMapsUrl, text: config.company.streetAddress },
  { icon: Mail, title: 'common:email', link: `mailto:${config.company.email}`, text: config.company.email },
];

if (config.company.scheduleCallUrl)
  methods.push({ icon: CalendarCheck, title: 'common:book', link: config.company.scheduleCallUrl, text: 'common:text.schedule_call' });
if (config.company.tel) methods.push({ icon: PhoneCall, title: 'common:call', link: `tel:${config.company.tel}`, text: config.company.tel });

const Contact = () => {
  const { t } = useTranslation();
  return (
    <PublicPage title="common:contact_us">
      <div className="container pb-16 pt-20">
        <h1 className="mb-4 text-3xl font-semibold text-center sm:text-left md:text-4xl">{t('common:text.leave_message')}</h1>
        <p className="mb-8 text-muted-foreground text-center sm:text-left sm:text-lg">{t('common:text.contact_us')}</p>
        <ContactFormMap />
      </div>

      <div className="container mb-12 mx-auto">
        <div className="flex flex-wrap justify-evenly gap-2">
          {methods.map((method) => (
            <div key={t(method.title)} className="mb-10 text-center h-[200px] w-[160px] sm:w-[200px]">
              <div className="text-primary mx-auto mb-5 flex h-[100px] w-[100px] items-center justify-center rounded-full bg-gray-100 dark:bg-white/5 sm:h-[130px] sm:w-[130px]">
                <method.icon size={48} strokeWidth={config.theme.strokeWidth} />
              </div>
              <div className="text-center">
                <h4 className="mb-3 text-lg font-semibold">{t(method.title)}</h4>
                <p>
                  <a href={method.link} className="hover:underline underline-offset-4 text-sm sm:text-base group" target="_blank" rel="noreferrer">
                    {t(method.text)}
                    <ArrowUpRight
                      size={16}
                      strokeWidth={config.theme.strokeWidth}
                      className="inline-block text-primary -mt-2 ml-1 opacity-50 group-hover:opacity-100"
                    />
                  </a>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PublicPage>
  );
};

export default Contact;
