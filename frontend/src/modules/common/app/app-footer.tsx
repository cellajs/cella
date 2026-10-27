import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Logo } from '~/modules/common/logo';
import { UserLanguage } from '~/modules/me/user-language';
import { UserTheme } from '~/modules/me/user-theme';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export interface FooterLinkProps {
  /** The link's `c:` locale key, which names it. */
  id: 'about' | 'legal' | 'sign_in' | 'status';
  href: string;
}

/** The in-app footer's own links; a caller passing `links` replaces them. */
const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'legal', href: '/legal' },
];

function AppFooterLink({ id, href }: FooterLinkProps) {
  const { t } = useTranslation();

  return (
    <li>
      <Button size="xs" variant="ghost" render={<Link to={href} />}>
        {t(`c:${id}`)}
      </Button>
    </li>
  );
}

interface AppFooterLinksProps {
  links?: FooterLinkProps[];
  className?: string;
}

export function AppFooterLinks({ links = defaultFooterLinks, className = '' }: AppFooterLinksProps) {
  const { t } = useTranslation();
  const contactButtonRef = useRef<HTMLButtonElement>(null);
  const statusUrl = appConfig.statusUrl?.trim();
  const footerLinks: FooterLinkProps[] = statusUrl ? [...links, { id: 'status', href: statusUrl }] : links;

  return (
    <ul className={cn('flex flex-wrap gap-4 text-center', className)}>
      {footerLinks.map((link) => (
        <AppFooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <Button ref={contactButtonRef} variant="ghost" size="xs" onClick={() => contactFormHandler(contactButtonRef)}>
          {t('c:contact')}
        </Button>
      </li>
    </ul>
  );
}

interface AppFooterProps {
  className?: string;
}

export function AppFooter({ className = '' }: AppFooterProps) {
  const { t } = useTranslation();
  return (
    <footer className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-4">
        <UserLanguage />
        <div className="mr-1 opacity-20 first:hidden">|</div>
        <Link
          to="/about"
          draggable={false}
          className="focus-effect active:press rounded-md transition-transform hover:scale-105"
          aria-label={t('c:go_to_about')}
        >
          <Logo height={25} title={t('c:go_to_about')} />
        </Link>
        <div className="ml-1 opacity-20">|</div>
        <UserTheme />
      </div>
      <AppFooterLinks />
    </footer>
  );
}
