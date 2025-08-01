import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';

import Logo from '~/modules/common/logo';
import { BackgroundCurve } from '~/modules/marketing/about/hero';
import { footerSections, legalLinks } from '~/modules/marketing/marketing-config';
import SubscribeNewsletterForm from '~/modules/marketing/subscribe-newsletter-form';
import { isCDNUrl } from '~/utils/is-cdn-url';

const currentYear = new Date().getFullYear();
const companyName = appConfig.company.name;
const productName = appConfig.name;

function FooterLinks() {
  const { t } = useTranslation();

  return (
    <nav>
      <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {footerSections.map((section) => (
          <li key={section.title} className={section.hideOnMobile ? 'max-sm:hidden' : ''}>
            <div className="font-display text-sm font-semibold tracking-wider text-white/40">{t(section.title)}</div>

            <ul className="mt-4 text-sm text-white/90">
              {section.links.map((link) => {
                const target = isCDNUrl(link.href) ? '_blank' : '_self';
                return (
                  <li key={link.title} className="mt-4">
                    <Link to={link.href} target={target} className="underline-offset-4 transition hover:underline rounded-sm p-1 focus-effect">
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

export const Credits = ({ className }: { className?: string }) => {
  const { t } = useTranslation();

  return (
    <div className={clsx('pb-12 text-center text-xs', className)}>
      <p>
        © {currentYear}. {productName} {t('common:is_built_by', { companyName })}.
      </p>
    </div>
  );
};

export const MarketingFooter = () => {
  const { t } = useTranslation();
  const sectionClass = 'rich-gradient dark-gradient relative min-h-[30vw] pt-[15vw]';

  return (
    <div className="relative">
      <div className="absolute z-[-1] mt-[-28vw] w-full">
        <BackgroundCurve />
      </div>

      <section className={sectionClass}>
        <div className="container flex max-w-5xl pt-8 px-8 flex-col items-center gap-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2">
            <FooterLinks />
            <div className="">
              <div className="font-display text-sm font-semibold tracking-wider text-white/50">{t('common:request_info')}</div>
              <div className="mt-4 text-sm text-white/90">{t('common:request_info.text', { appName: appConfig.name })}</div>
              <SubscribeNewsletterForm />
            </div>
          </div>

          <Link
            to="/about"
            replace={location.pathname === '/about'}
            hash=""
            draggable="false"
            onClick={() => {
              scrollTo(0, 0);
            }}
            className="mt-12 hover:opacity-90 active:scale-95 rounded-sm p-1 focus-effect"
          >
            <Logo textColor="white" iconColor="#793f599e" />
          </Link>

          <ul className="mb-12 mt-6 flex flex-wrap justify-center gap-x-4 gap-y-4 border-t border-white/20 pt-12 text-center text-sm text-white/60">
            {legalLinks.map((link) => (
              <li key={link.title}>
                <Link to={link.href} draggable="false" className="underline-offset-4 transition hover:underline rounded-sm p-1 focus-effect">
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
