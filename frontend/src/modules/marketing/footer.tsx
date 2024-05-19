import clsx from 'clsx';
import { config } from 'config';
import { Github, Twitter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from '~/modules/common/logo';
import { BackgroundCurve } from '~/modules/marketing/about/hero';
import NewsletterForm from '~/modules/marketing/newsletter';
import { Link } from '../common/link';

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

const currentYear = new Date().getFullYear();
const companyName = config.company.name;
const productName = config.name;

const footerSections = [
  {
    title: 'common:product',
    links: [
      { title: 'common:about', href: '/about' },
      { title: 'common:sign_up', href: '/auth/sign-in' },
    ],
  },
  {
    title: 'common:documentation',
    hideOnMobile: true,
    links: [
      { title: 'common:api_docs', href: `${config.backendUrl}/docs` },
      { title: 'common:architecture', href: 'https://github.com/cellajs/cella/blob/main/info/ARCHITECTURE.md' },
      { title: 'common:roadmap', href: 'https://github.com/cellajs/cella/blob/main/info/ROADMAP.md' },
    ],
  },
  {
    title: 'common:connect',
    links: [{ title: 'common:contact_us', href: '/contact' }, ...socials],
  },
];

const legalLinks = [
  { title: 'common:legal', href: '/legal' },
  { title: 'common:accessibility', href: '/accessibility' },
];

type FooterLink = {
  as?: 'a' | 'tanstack-link';
};

function FooterLinks({ as = 'tanstack-link' }: FooterLink) {
  const { t } = useTranslation();

  return (
    <nav>
      <ul className="grid grid-cols-2 gap-8 sm:grid-cols-3">
        {footerSections.map((section) => (
          <li key={section.title} className={section.hideOnMobile ? 'hidden sm:block' : ''}>
            <div className="font-display text-sm font-semibold tracking-wider text-white/40">{t(section.title)}</div>

            <ul className="mt-4 text-sm text-white/90">
              {section.links.map((link) => {
                const target = link.href.startsWith('http') ? '_blank' : '_self';
                return (
                  <li key={link.title} className="mt-4">
                    <Link to={link.href} target={target} as={as} className="underline-offset-4 transition hover:underline">
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

export function Credits({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <div className={clsx('pb-12 text-center text-xs', className)}>
      © {currentYear}. {productName} {t('common:is_built_by')} {companyName}.
    </div>
  );
}

type PublicFooter = {
  as?: 'a' | 'tanstack-link';
};

export function MarketingFooter({ as = 'tanstack-link' }: PublicFooter) {
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
            <FooterLinks as={as} />
            <div className="">
              <div className="font-display text-sm font-semibold tracking-wider text-white/50">{t('common:request_info')}</div>
              <div className="mt-4 text-sm text-white/90">{t('common:request_info.text')}</div>
              <NewsletterForm />
            </div>
          </div>

          <Link
            to="/about"
            replace={typeof window !== 'undefined' && location.pathname === '/about'}
            hash=""
            onClick={() => {
              scrollTo(0, 0);
            }}
            className="mt-12 hover:opacity-90 active:scale-95"
            as={as}
          >
            <Logo textColor="white" iconColor="#793f599e" />
          </Link>

          <ul className="mb-12 mt-6 flex flex-wrap justify-center gap-x-6 gap-y-4 border-t border-white/20 pt-12 text-center text-xs text-white/60">
            {legalLinks.map((link) => (
              <li key={link.title}>
                <Link to={link.href} as={as} className="underline-offset-4 transition hover:underline">
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
}
