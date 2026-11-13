import { CalendarCheckIcon, CopyIcon, MailIcon, MapPinIcon, PhoneCallIcon } from 'lucide-react';
import { type MouseEvent, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type CompanyAddress } from 'shared';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import type { TKey } from '~/lib/i18n-locales';
import { announce } from '~/modules/common/announce';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { ExternalArrow } from '~/modules/common/external-arrow';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
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

/**
 * Keeps a link from opening when its click ends a drag that selected its text. Pair it with `draggable={false}` and
 * `select-text`: without the class, Chromium extends a selection that starts in a link to the end of the page.
 */
export const cancelSelectingClick = (event: MouseEvent) => {
  if (window.getSelection()?.isCollapsed === false) event.preventDefault();
};

function ContactMethodRow({ method }: { method: ContactMethod }) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const { copied, copyToClipboard } = useCopyToClipboard();

  const webPage = isWebPage(method.link);
  const text = method.textKey ? t(method.textKey) : method.text;
  const { address } = method;
  const addressLines = address ? [`${address.city}, ${address.postalCode}`, regionName(address.regionCode, i18n.language)] : [];
  // An address, an email or a phone number is worth copying; a link to a web page is not
  const copyValue = address ? [text, ...addressLines].join(', ') : !webPage && text;

  const handleCopy = async ({ currentTarget }: MouseEvent<HTMLButtonElement>) => {
    if (copyValue && (await copyToClipboard(copyValue))) announce(currentTarget, t('c:copied'));
  };

  return (
    <li className="relative flex items-center gap-3 py-2.5 pr-1.5 pl-3">
      <div className="bg-accent/50 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
        <method.icon className="size-5 stroke-[1.5]" />
      </div>
      <div className="min-w-0 grow">
        <h3 id={titleId} className="font-semibold">
          {t(method.title)}
        </h3>
        <a
          href={method.link}
          className="group/external-link focus-effect text-muted-foreground block rounded-md text-sm select-text before:absolute before:inset-0"
          target={webPage ? '_blank' : undefined}
          rel={webPage ? 'noreferrer' : undefined}
          draggable={false}
          onClick={cancelSelectingClick}
        >
          {/* Above the row-wide link layer: a drag that starts on the text selects it */}
          <span className="relative block">
            {text}
            {webPage && <ExternalArrow />}
            {addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        </a>
      </div>
      {copyValue && (
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={t('c:copy')} aria-describedby={titleId} onClick={handleCopy}>
          <CopiedIcon copied={copied} icon={CopyIcon} />
        </Button>
      )}
    </li>
  );
}

/** The contact methods as framed rows, where each link covers its row and a copy button sits above it. */
export function ContactMethodRows({ className }: { className?: string }) {
  return (
    <ul className={cn('divide-y rounded-lg border', className)}>
      {contactMethods.map((method) => (
        <ContactMethodRow key={method.title} method={method} />
      ))}
    </ul>
  );
}
