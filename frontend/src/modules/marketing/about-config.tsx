import { config } from 'config';
import { Building2, Folder, Github, StickyNote, Twitter, Users } from 'lucide-react';

export const socials = [
  { title: 'Twitter', href: config.company.twitterUrl, icon: Twitter },
  { title: 'GitHub', href: config.company.githubUrl, icon: Github },
];

export const footerSections = [
  {
    title: 'common:product',
    links: [
      { title: 'common:about', href: '/about' },
      { title: 'common:sign_in', href: '/auth/sign-in' },
      { title: 'common:docs', href: `${config.backendUrl}/docs` },
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
  action: 'sign_in' | 'contact_us' | 'waitlist_request';
  priceId: string | null;
  featureCount: number;
  borderColor: string;
  popular?: boolean;
  discount?: string;
}

export const pricingPlans: PricingPlan[] = [
  { id: 'free', action: 'waitlist_request', priceId: null, featureCount: 3, borderColor: '', discount: 'Free' },
  { id: 'pro', action: 'contact_us', priceId: null, featureCount: 4, borderColor: 'ring-4 ring-primary/5', popular: true },
];

interface FaqItem {
  id: string;
  link?: string;
}
export const faqsData: FaqItem[] = [
  { id: 'production-ready', link: config.company.githubUrl },
  { id: 'cella-vs-next' },
  { id: 'alternative-to-nextjs' },
  { id: 'cella-made-in-europe' },
];

export const counts = [
  { id: 'user', title: 'common:users', icon: Users },
  { id: 'organization', title: 'common:organizations', icon: Building2 },
  { id: 'project', title: 'app:projects', icon: Folder },
  { id: 'task', title: 'app:tasks', icon: StickyNote },
] as const;
