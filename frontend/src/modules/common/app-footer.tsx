import { Link } from '@tanstack/react-router';
import ContactForm from '~/modules/common/contact-form/contact-form';
import Logo from '~/modules/common/logo';
import ThemeDropdown from '~/modules/common/theme-dropdown';
import { dialog } from './dialoger/state';
import LanguageDropdown from './language-dropdown';

export interface FooterLinkProps {
  title: string;
  href: string;
}

const FooterLink = ({ title, href }: FooterLinkProps) => (
  <li>
    <Link to={href} className="underline-offset-4 transition hover:underline">
      {title}
    </Link>
  </li>
);

const footerlinks = [
  { title: 'About', href: '/about' },
  { title: 'Terms', href: '/terms' },
  { title: 'Privacy', href: '/privacy' },
];

function AppFooter() {
  return (
    <footer className="container flex flex-col mt-12 items-center gap-4">
      <div className="flex items-center gap-4">
        <LanguageDropdown size={18} align='start' />
        <div className="mr-1 font-light text-muted text-sm">|</div>
        <Link to="/" className="hover:scale-105 transition-transform active:translate-y-[1px]">
          <Logo height={25} />
        </Link>
        <div className="ml-1 font-light text-muted text-sm">|</div>
        <ThemeDropdown size={18} />
      </div>
      <ul className="text-foreground/60 mb-8 flex flex-wrap justify-center gap-x-6 gap-y-4 text-center text-xs">
        {footerlinks.map((link) => (
          <FooterLink key={link.href} title={link.title} href={link.href} />
        ))}
        <li>
          <button
            className="underline-offset-4 transition hover:underline"
            type="button"
            aria-label="Open contact form"
            onClick={() => {
              dialog(<ContactForm dialog />, {
                drawerOnMobile: false,
                className: 'sm:max-w-[64rem]',
                title: 'Contact us',
                text: 'We will get back to you as soon as possible!',
              });
            }}
          >
            Contact
          </button>
        </li>
      </ul>
    </footer>
  );
}

export { AppFooter };
