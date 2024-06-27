import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import ContactForm from '~/modules/common/contact-form/contact-form';
import Logo from '~/modules/common/logo';
import UserTheme from '~/modules/common/user-theme';
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
      <Link to={href} className="underline-offset-4 transition hover:underline">
        {t(`common:${id}`)}
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
      className: 'sm:max-w-[64rem]',
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
    <ul className={cn('text-foreground/60 mb-8 flex flex-wrap justify-center gap-x-6 gap-y-4 text-center text-xs', className)}>
      {links.map((link) => (
        <FooterLink key={link.id} id={link.id} href={link.href} />
      ))}
      <li>
        <button
          className="underline-offset-4 transition hover:underline"
          type="button"
          aria-label="Open contact form"
          onClick={handleOpenContactForm}
        >
          {t('common:contact')}
        </button>
      </li>
    </ul>
  );
};

// App Footer component
export const AppFooter = () => {
  return (
    <footer className="container flex flex-col my-10 items-center gap-4">
      <div className="flex items-center gap-4">
        <UserLanguage align="start" />
        <div className="mr-1 font-light text-muted text-sm">|</div>
        <Link to="/" className="hover:scale-105 transition-transform active:translate-y-[1px]">
          <Logo height={25} />
        </Link>
        <div className="ml-1 font-light text-muted text-sm">|</div>
        <UserTheme size={18} />
      </div>
      <FooterLinks />
    </footer>
  );
};
