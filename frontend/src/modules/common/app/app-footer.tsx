import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Logo } from '~/modules/common/logo';
import { UserLanguage } from '~/modules/me/user-language';
import { UserTheme } from '~/modules/me/user-theme';
import { Button } from '~/modules/ui/button';
import { defaultFooterLinks } from '~/nav-config';
import { cn } from '~/utils/cn';

export interface FooterLinkProps {
  id: string;
  href: string;
}

/**
 * Component for rendering a single footer link.
 */
const AppFooterLink = ({ id, href }: FooterLinkProps) => {
  const { t } = useTranslation();

  return (
    <li>
      <Button size="xs" variant="ghost" className="" render={<Link to={href} draggable={false} />}>
        {t(`c:${id}`)}
      </Button>
    </li>
  );
};

interface FooterLinksProps {
  links?: FooterLinkProps[];
  className?: string;
}

/**
 * Row of footer links including a contact button
 */
export const AppFooterLinks = ({ links = defaultFooterLinks, className = '' }: FooterLinksProps) => {
  const { t } = useTranslation();
  const contactButtonRef = useRef(null);
  const statusUrl = appConfig.statusUrl?.trim();
  const footerLinks = statusUrl ? [...links, { id: 'status', href: statusUrl }] : links;

  return (
    <ul className={cn('flex flex-wrap gap-4 text-center', className)}>
      {footerLinks.map((link) => (
        <AppFooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <Button
          ref={contactButtonRef}
          variant="ghost"
          className=""
          size="xs"
          aria-label="Open contact form"
          onClick={() => contactFormHandler(contactButtonRef)}
        >
          {t('c:contact')}
        </Button>
      </li>
    </ul>
  );
};

/**
 * App Footer component
 */
export const AppFooter = ({ className = '' }) => {
  return (
    <footer className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-4">
        <UserLanguage />
        <div className="mr-1 opacity-20 first:hidden">|</div>
        <Link
          to="/about"
          draggable={false}
          className="focus-effect rounded-md transition-transform hover:scale-105 active:translate-y-[.05rem]"
        >
          <Logo height={25} />
        </Link>
        <div className="ml-1 opacity-20">|</div>
        <UserTheme />
      </div>
      <AppFooterLinks />
    </footer>
  );
};
