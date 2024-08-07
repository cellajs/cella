import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import ContactForm from '~/modules/common/contact-form/contact-form';
import Logo from '~/modules/common/logo';
import UserTheme from '~/modules/common/user-theme';
import { Button } from '../ui/button';
import { dialog } from './dialoger/state';
import UserLanguage from './user-language';

export interface FooterLinkProps {
  id: string;
  href: string;
}

export const FooterLink = ({ id, href }: FooterLinkProps) => {
  const { t } = useTranslation();

  return (
    <li>
      <Link to={href}>
        <Button variant="ghost">{t(`common:${id}`)}</Button>
      </Link>
    </li>
  );
};

// Default footer links
const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'legal', href: '/legal' },
];

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
      text: t('common:contact_us.text'),
    });
  };
  // Not on every page we have footer e.g. workspace
  // useEffect(() => {
  //   document.addEventListener('openContactForm', handleOpenContactForm);
  //   return () => {
  //     document.removeEventListener('openContactForm', handleOpenContactForm);
  //   };
  // }, []);

  return (
    <ul className={cn('text-foreground/60 flex flex-wrap justify-center gap-2 text-center text-sm', className)}>
      {links.map((link) => (
        <FooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <Button variant="ghost" aria-label="Open contact form" onClick={handleOpenContactForm}>
          {t('common:contact')}
        </Button>
      </li>
    </ul>
  );
};

// App Footer component
export const AppFooter = ({ className = '' }) => {
  return (
    <footer className={cn('flex flex-col items-center gap-2', className)}>
      <div className="flex items-center gap-4">
        <UserLanguage align="start" />
        <div className="mr-1 font-light text-muted">|</div>
        <Link to="/" className="hover:scale-105 transition-transform active:translate-y-[.07rem]">
          <Logo height={25} />
        </Link>
        <div className="ml-1 font-light text-muted">|</div>
        <UserTheme size={18} />
      </div>
      <FooterLinks />
    </footer>
  );
};
