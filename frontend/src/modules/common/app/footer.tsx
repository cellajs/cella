import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import Logo from '~/modules/common/logo';
import UserLanguage from '~/modules/me/user-language';
import UserTheme from '~/modules/me/user-theme';
import { Button, buttonVariants } from '~/modules/ui/button';
import { defaultFooterLinks } from '~/nav-config';
import { cn } from '~/utils/cn';

export interface FooterLinkProps {
  id: string;
  href: string;
}

export const FooterLink = ({ id, href }: FooterLinkProps) => {
  const { t } = useTranslation();

  return (
    <li>
      <Link to={href} draggable="false" className={cn(buttonVariants({ size: 'xs', variant: 'ghost' }), 'font-light')}>
        {t(`common:${id}`)}
      </Link>
    </li>
  );
};

interface FooterLinksProps {
  links?: FooterLinkProps[];
  className?: string;
}

// Row of footer links including a contact button
export const FooterLinks = ({ links = defaultFooterLinks, className = '' }: FooterLinksProps) => {
  const { t } = useTranslation();
  const contactButtonRef = useRef(null);

  return (
    <ul className={cn('flex flex-wrap gap-4 text-center', className)}>
      {links.map((link) => (
        <FooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <Button
          ref={contactButtonRef}
          variant="ghost"
          className="font-light"
          size="xs"
          aria-label="Open contact form"
          onClick={() => contactFormHandler(contactButtonRef)}
        >
          {t('common:contact')}
        </Button>
      </li>
    </ul>
  );
};

// App Footer component
export const AppFooter = ({ className = '' }) => {
  return (
    <footer className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-4">
        <UserLanguage align="start" contentClassName="z-110" />
        <div className="mr-1 font-light text-muted first:hidden">|</div>
        <Link to="/about" draggable="false" className="hover:scale-105 transition-transform active:translate-y-[.05rem] rounded-md focus-effect">
          <Logo height={25} />
        </Link>
        <div className="ml-1 font-light text-muted">|</div>
        <UserTheme contentClassName="z-110" />
      </div>
      <FooterLinks />
    </footer>
  );
};
