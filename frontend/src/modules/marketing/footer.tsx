import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { Logo } from '~/modules/common/logo';
import { BackgroundCurve } from '~/modules/marketing/background-curve';
import { footerSections, legalLinks } from '~/modules/marketing/marketing-config';
import { SubscribeNewsletterForm } from '~/modules/marketing/subscribe-newsletter-form';
import { useIsAboutPage } from '~/modules/marketing/use-is-about-page';
import { tw } from '~/utils/tw';

const currentYear = new Date().getFullYear();

const headingClass = tw('font-heading text-sm font-semibold tracking-wider text-white/60');
const textClass = tw('mt-4 text-sm text-white/90');

export interface FooterLinkProps {
  title: TKey;
  /** Unset for a link the config leaves out, which the footer skips. */
  href?: string;
}

type ShownLink = Required<FooterLinkProps>;

// The sign-up link only shows where visitors can sign up by themselves
const isShown = <T extends FooterLinkProps>(link: T): link is T & ShownLink =>
  !!link.href && (link.title !== 'c:sign_up' || appConfig.has.selfRegistration);

/** A footer link; a web page opens in a new tab, an app route in this one. */
function FooterLink({ title, href }: ShownLink) {
  const { t } = useTranslation();
  const isExternal = href.startsWith('http');

  return (
    <Link
      to={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      draggable={false}
      className="focus-effect link-decoration active:link-decoration-strong rounded-sm box-decoration-clone p-1 transition hover:underline"
    >
      {t(title)}
    </Link>
  );
}

function FooterLinks() {
  const { t } = useTranslation();

  return (
    <nav>
      <ul className="columns-2 gap-8 sm:grid sm:columns-auto sm:grid-cols-3">
        {footerSections.map((section) => (
          <li key={section.title} className="break-inside-avoid max-sm:mb-8 max-sm:last:mb-0">
            <div className={headingClass}>{t(section.title)}</div>

            <ul className={textClass}>
              {section.links.filter(isShown).map((link) => (
                <li key={link.title} className="-mx-1 mt-4">
                  <FooterLink title={link.title} href={link.href} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MarketingFooter() {
  const { t } = useTranslation();
  const isAboutPage = useIsAboutPage();
  const statusUrl = appConfig.statusUrl.trim();
  const legalFooterLinks: ShownLink[] = statusUrl ? [...legalLinks, { title: 'c:status', href: statusUrl }] : legalLinks;

  return (
    <section className="rich-gradient dark-gradient relative min-h-[30vw] pt-[15vw]">
      <BackgroundCurve position="top" />
      <div className="container flex max-w-5xl flex-col items-center gap-4 px-8 pt-8">
        <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2">
          <FooterLinks />
          <div>
            <div className={headingClass}>{t('c:request_info')}</div>
            <div className={textClass}>{t('c:request_info.text')}</div>
            <SubscribeNewsletterForm />
          </div>
        </div>

        <Link
          to="/about"
          replace={isAboutPage}
          hash=""
          draggable={false}
          onClick={() => scrollTo(0, 0)}
          className="focus-effect active:press mt-12 rounded-sm p-1 transition-transform sm:hover:scale-105"
          aria-label={t('c:go_to_about')}
        >
          <Logo size="xl" textColor="white" iconColor="#b07a939e" title={t('c:go_to_about')} />
        </Link>

        <ul className="mt-6 mb-12 flex flex-wrap justify-center gap-4 border-t border-white/20 pt-12 text-center text-sm text-white/60">
          {legalFooterLinks.map((link) => (
            <li key={link.title}>
              <FooterLink title={link.title} href={link.href} />
            </li>
          ))}
        </ul>

        <p className="pb-12 text-center text-xs text-white/60">{t('c:credits', { year: currentYear })}</p>
      </div>
    </section>
  );
}
