import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { config } from 'config';
import { Github, Twitter } from 'lucide-react';

import Logo from '~/components/logo';
import NewsletterForm from '~/components/newsletter';
import { BackgroundCurve } from '~/pages/about/hero';

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

const currentYear = new Date().getFullYear();
const companyName = config.company.name;
const productName = config.name;

export const footerSections = [
  {
    title: 'Product',
    links: [
      { title: 'About', href: '/about' },
      { title: 'Sign up', href: '/auth/sign-in' },
    ],
  },
  {
    title: 'Documentation',
    hideOnMobile: true,
    links: [
      { title: 'API docs', href: `${config.backendUrl}/docs` },
      { title: 'Architecture', href: 'https://github.com/cellajs/cella/blob/main/info/ARCHITECTURE.md' },
      { title: 'Roadmap', href: 'https://github.com/cellajs/cella/blob/main/info/ROADMAP.md' },
    ],
  },
  {
    title: 'Connect',
    links: [{ title: 'Contact us', href: '/contact' }, ...socials],
  },
];

export const legalLinks = [
  { title: 'Terms', href: '/terms' },
  { title: 'Privacy', href: '/privacy' },
  { title: 'Accessibility', href: '/accessibility' },
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
                const target = link.href.startsWith('http') ? 'blank' : 'self';
                return (
                  <li key={link.title} className="mt-4">
                    {target === 'self' && (
                      <Link to={link.href} className="underline-offset-4 transition hover:underline">
                        {link.title}
                      </Link>
                    )}
                    {target === 'blank' && (
                      <a href={link.href} target="_blank" className="underline-offset-4 transition hover:underline" rel="noreferrer">
                        {link.title}
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

export function Credits({ className }: { className?: string }) {
  return (
    <div className={clsx('pb-12 text-center text-xs', className)}>
      © {currentYear}. {productName} is built by {companyName}.
    </div>
  );
}

export function PublicFooter() {
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
              <div className="font-display text-sm font-semibold tracking-wider text-white/50">Join waitlist</div>
              <div className="mt-4 text-sm text-white/90">
                Interested in becoming a donate or build member? Join the waitlist and we will contact you.
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
