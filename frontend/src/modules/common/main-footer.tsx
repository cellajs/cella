import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { dialog } from '~/modules/common/dialoger/state';
import Logo from '~/modules/common/logo';
import UserLanguage from '~/modules/common/user-language';
import UserTheme from '~/modules/common/user-theme';
import { Button } from '~/modules/ui/button';
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
      <Link to={href}>
        <Button variant="ghost" className="font-light" size="xs">
          {t(`common:${id}`)}
        </Button>
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

  const handleOpenContactForm = () => {
    dialog(<ContactForm dialog />, {
      id: 'contact-form',
      drawerOnMobile: false,
      className: 'sm:max-w-5xl',
      title: t('common:contact_us'),
      description: t('common:contact_us.text'),
    });
  };

  return (
    <ul className={cn('flex flex-wrap gap-4 text-center', className)}>
      {links.map((link) => (
        <FooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <Button variant="ghost" className="font-light" size="xs" aria-label="Open contact form" onClick={handleOpenContactForm}>
          {t('common:contact')}
        </Button>
      </li>
    </ul>
  );
};

// App Footer component
export const MainFooter = ({ className = '' }) => {
  return (
    <footer className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center gap-4">
        <UserLanguage align="start" />
        <div className="mr-1 font-light text-muted">|</div>
        <Link to="/about" className="hover:scale-105 transition-transform active:translate-y-[.07rem]">
          <Logo height={25} />
        </Link>
        <div className="ml-1 font-light text-muted">|</div>
        <UserTheme size={18} />
      </div>
      <FooterLinks />
    </footer>
  );
};
