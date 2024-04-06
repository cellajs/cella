import { ReactNode, FC } from 'react';
import PublicPage from 'frontend/src/modules/common/public-page';
import RenderNavItems from './NavItems';
import { config } from 'config';
import { Github, Twitter } from 'lucide-react';
import { useTranslation } from 'frontend/node_modules/react-i18next';
import Logo from 'frontend/src/modules/common/logo';

type Props = {
  children: ReactNode;
};

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

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
  { title: 'common:terms', href: '/terms' },
  { title: 'common:privacy', href: '/privacy' },
  { title: 'common:accessibility', href: '/accessibility' },
];

type FooterLink = {
  Link?: JSX.Element;
};

function FooterLinks({ Link }: FooterLink) {
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
                    {Link ?? (
                      <a href={link.href} target={target} className="underline-offset-4 transition hover:underline">
                        {t(link.title)}
                      </a>
                    )}
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

const AbountFooter = () => {
  return (
    <a href="/about" className="mt-12 hover:opacity-90 active:scale-95">
      <Logo textColor="white" iconColor="#793f599e" />
    </a>
  );
};

function PublicFooter() {
  const { t } = useTranslation();

  return legalLinks.map((link) => (
    <li key={link.title}>
      <a href={link.href} className="underline-offset-4 transition hover:underline">
        {t(link.title)}
      </a>
    </li>
  ));
}

const MainLayout: FC<Props> = ({ children }) => {
  return (
    <PublicPage title="Blog" Link={<RenderNavItems />} AboutLink={<AbountFooter />} LegalLinks={<PublicFooter />} FooterLink={<FooterLinks />}>
      {children}
    </PublicPage>
  );
};

export default MainLayout;
