import { config } from 'config';
import { Building2, Github, Twitter, Users } from 'lucide-react';

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

export const footerSections = [
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

export const legalLinks = [
  { title: 'common:legal', href: '/legal' },
  { title: 'common:accessibility', href: '/accessibility' },
];

interface PricingPlan {
  id: string;
  priceId: string | null;
  featureCount: number;
  borderColor: string;
  popular?: boolean;
}

export const pricingPlans: PricingPlan[] = [
  { id: 'donate', priceId: null, featureCount: 5, borderColor: '' },
  { id: 'build', priceId: null, featureCount: 4, borderColor: 'ring-4 ring-primary/5', popular: true },
  { id: 'partner', priceId: null, featureCount: 3, borderColor: '' },
];

interface Count {
  id: string;
  title: string;
  icon: JSX.ElementType;
}

export const counts: Count[] = [
  { id: 'users', title: 'common:users', icon: Users },
  { id: 'organizations', title: 'common:organizations', icon: Building2 },
];
