import { CalendarCheckIcon, MailIcon, MapPinIcon, PhoneCallIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig, type CompanyAddress } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { ExternalArrow } from '~/modules/common/external-arrow';
import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';
import { regionName } from '~/utils/region-name';

export interface ContactMethod {
  icon: IconComponent;
  title: TKey;
  link: string;
  /** Link text as a translation key; wins over `text`. */
  textKey?: TKey;
  text?: string;
  /** The address whose street is `text`; a row adds its other lines. */
  address?: CompanyAddress;
}

const { address, email, phone, scheduleCallUrl } = appConfig.company;

/** The ways to reach the company that its config fills in. */
export const contactMethods: ContactMethod[] = [];

if (address?.directionsUrl)
  contactMethods.push({ icon: MapPinIcon, title: 'c:visit', link: address.directionsUrl, text: address.streetAddress, address });
contactMethods.push({ icon: MailIcon, title: 'c:email', link: `mailto:${email}`, text: email });
if (scheduleCallUrl) contactMethods.push({ icon: CalendarCheckIcon, title: 'c:book', link: scheduleCallUrl, textKey: 'c:schedule_call' });
if (phone) contactMethods.push({ icon: PhoneCallIcon, title: 'c:call', link: `tel:${phone}`, text: phone });

/** A link to a web page opens a tab and shows an arrow; a mail or phone link hands over to an app. */
export const isWebPage = (link: string) => link.startsWith('http');

/** The contact methods as framed rows, where each link covers its row. */
export function ContactMethodRows({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();

  return (
    <ul className={cn('divide-y rounded-lg border', className)}>
      {contactMethods.map((method) => {
        const webPage = isWebPage(method.link);
        return (
          <li key={method.title} className="relative flex items-center gap-3 px-3 py-2.5">
            <div className="bg-accent/50 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
              <method.icon className="size-5 stroke-[1.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold">{t(method.title)}</h3>
              <a
                href={method.link}
                className="group/external-link focus-effect text-muted-foreground block rounded-md text-sm before:absolute before:inset-0"
                target={webPage ? '_blank' : undefined}
                rel={webPage ? 'noreferrer' : undefined}
              >
                {method.textKey ? t(method.textKey) : method.text}
                {webPage && <ExternalArrow />}
                {method.address && (
                  <>
                    <span className="block">
                      {method.address.city}, {method.address.postalCode}
                    </span>
                    <span className="block">{regionName(method.address.regionCode, i18n.language)}</span>
                  </>
                )}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
