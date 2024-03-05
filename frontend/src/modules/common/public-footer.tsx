import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { config } from 'config';
import { Github, Twitter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { i18n } from '~/lib/i18n';

import Logo from '~/modules/common/logo';
import NewsletterForm from '~/modules/common/newsletter';
import { BackgroundCurve } from '~/modules/marketing/about/hero';

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

const currentYear = new Date().getFullYear();
const companyName = config.company.name;
const productName = config.name;

const footerSections = [
  {
    title: i18n.t('common:product'),
    links: [
      { title: i18n.t('common:about'), href: '/about' },
      { title: i18n.t('common:sign_up'), href: '/auth/sign-in' },
    ],
  },
  {
    title: i18n.t('common:documentation'),
    hideOnMobile: true,
    links: [
      { title: i18n.t('common:api_docs'), href: `${config.backendUrl}/docs` },
      { title: i18n.t('common:architecture'), href: 'https://github.com/cellajs/cella/blob/main/info/ARCHITECTURE.md' },
      { title: i18n.t('common:roadmap'), href: 'https://github.com/cellajs/cella/blob/main/info/ROADMAP.md' },
    ],
  },
  {
    title: i18n.t('common:connect'),
    links: [{ title: i18n.t('common:contact_us'), href: '/contact' }, ...socials],
  },
];

const legalLinks = [
  { title: i18n.t('common:terms'), href: '/terms' },
  { title: i18n.t('common:privacy'), href: '/privacy' },
  { title: i18n.t('common:accessibility'), href: '/accessibility' },
];

function FooterLinks() {
  return (
    <nav>
      <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {footerSections.map((section) => (
          <li key={section.title} className={section.hideOnMobile ? 'hidden sm:block' : ''}>
            <div className="font-display text-sm font-semibold tracking-wider text-white/40">{section.title}</div>

            <ul className="mt-4 text-sm text-white/90">
              {section.links.map((link) => {
                const target = link.href.startsWith('http') ? '_blank' : '_self';
                return (
                  <li key={link.title} className="mt-4">
                    <Link to={link.href} target={target} className="underline-offset-4 transition hover:underline">
                      {link.title}
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

export function Credits({ className }: { className?: string }) {
  return (
    <div className={clsx('pb-12 text-center text-xs', className)}>
      © {currentYear}. {productName} {i18n.t('common:is_built_by')} {companyName}.
    </div>
  );
}

export function PublicFooter() {
  const { t } = useTranslation();
  const sectionClass = 'rich-gradient dark-gradient relative min-h-[30vw] pt-[15vw]';

  return (
    <div className="relative">
      <div className="absolute z-[-1] mt-[-28vw] w-full">
        <BackgroundCurve />
      </div>

      <section className={sectionClass}>
        <div className="container flex max-w-[64rem] pt-8 px-8 flex-col items-center gap-4">
          <div className="grid grid-cols-1 gap-x-8 gap-y-16 lg:grid-cols-2">
            <FooterLinks />
            <div className="">
              <div className="font-display text-sm font-semibold tracking-wider text-white/50">{t('common:request_info')}</div>
              <div className="mt-4 text-sm text-white/90">
                {t('common:text.request_info')}
              </div>
              <NewsletterForm />
            </div>
          </div>

          <Link to="/about" hash="" className="mt-12 hover:opacity-90 active:scale-95">
            <Logo textColor="white" iconColor="#793f599e" />
          </Link>

          <ul className="mb-12 mt-6 flex flex-wrap justify-center gap-x-6 gap-y-4 border-t border-white/20 pt-12 text-center text-xs text-white/60">
            {legalLinks.map((link) => (
              <li key={link.title}>
                <Link to={link.href} className="underline-offset-4 transition hover:underline">
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>

          <Credits className="text-white/30" />
        </div>
      </section>
    </div>
  );
}
