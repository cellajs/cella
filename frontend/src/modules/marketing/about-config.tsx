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
  { id: 'free', priceId: null, featureCount: 3, borderColor: '' },
  { id: 'pro', priceId: null, featureCount: 4, borderColor: 'ring-4 ring-primary/5', popular: true },
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
