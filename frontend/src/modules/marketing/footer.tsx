import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { isCDNUrl } from 'shared/is-cdn-url';
import { Logo } from '~/modules/common/logo';
import { BackgroundCurve } from '~/modules/marketing/about/hero';
import { footerSections, legalLinks } from '~/modules/marketing/marketing-config';
import { SubscribeNewsletterForm } from '~/modules/marketing/subscribe-newsletter-form';

const currentYear = new Date().getFullYear();
const companyName = appConfig.company.name;
const productName = appConfig.name;

/**
 * Footer component for the marketing site, including navigation links, newsletter subscription, and credits.
 * - Displays different sections of links based on the configuration.
 * - Shows legal links and company credits.
 */
function FooterLinks() {
  const { t } = useTranslation();

  return (
    <nav>
      <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {footerSections.map((section) => (
          <li key={section.title} className={section.hideOnMobile ? 'max-sm:hidden' : ''}>
            <div className="font-display font-semibold text-sm text-white/40 tracking-wider">{t(section.title)}</div>

            <ul className="mt-4 text-sm text-white/90">
              {section.links.map((link) => {
                const target = isCDNUrl(link.href) ? '_blank' : '_self';
                return (
                  <li key={link.title} className="mt-4">
                    <Link
                      to={link.href}
                      target={target}
                      className="focus-effect rounded-sm p-1 underline-offset-4 transition hover:underline"
                    >
                      {t(link.title)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const Credits = ({ className }: { className?: string }) => {
  const { t } = useTranslation();

  return (
    <div className={clsx('pb-12 text-center text-xs', className)}>
      <p>
        © {currentYear}. {productName} {t('c:is_built_by', { companyName })}.
      </p>
    </div>
  );
};

export const MarketingFooter = () => {
  const { t } = useTranslation();
  const sectionClass = 'rich-gradient dark-gradient relative min-h-[30vw] pt-[15vw]';
  const statusUrl = appConfig.statusUrl?.trim();
  const legalFooterLinks = statusUrl ? [...legalLinks, { title: 'c:status', href: statusUrl }] : legalLinks;

  return (
    <div className="relative">
      <section className={sectionClass}>
        <BackgroundCurve position="top" />
        <div className="container flex max-w-5xl flex-col items-center gap-4 px-8 pt-8">
          <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2">
            <FooterLinks />
            <div className="">
              <div className="font-display font-semibold text-sm text-white/50 tracking-wider">
                {t('c:request_info')}
              </div>
              <div className="mt-4 text-sm text-white/90">{t('c:request_info.text', { appName: appConfig.name })}</div>
              <SubscribeNewsletterForm />
            </div>
          </div>

          <Link
            to="/about"
            replace={location.pathname === '/about'}
            hash=""
            draggable={false}
            onClick={() => {
              scrollTo(0, 0);
            }}
            className="focus-effect mt-12 rounded-sm p-1 hover:opacity-90 active:scale-95"
          >
            <Logo textColor="white" iconColor="#b07a939e" />
          </Link>

          <ul className="mt-6 mb-12 flex flex-wrap justify-center gap-x-4 gap-y-4 border-white/20 border-t pt-12 text-center text-sm text-white/60">
            {legalFooterLinks.map((link) => (
              <li key={link.title}>
                <Link
                  to={link.href}
                  draggable={false}
                  className="focus-effect rounded-sm p-1 underline-offset-4 transition hover:underline"
                >
                  {t(link.title)}
                </Link>
              </li>
            ))}
          </ul>

          <Credits className="text-white/30" />
        </div>
      </section>
    </div>
  );
};
