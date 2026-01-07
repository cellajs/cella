import type { JSX } from 'react';
import { lazy } from 'react';

export interface LegalSection {
  id: string;
  label: string | null;
}

export interface LegalTextConfig {
  component: React.LazyExoticComponent<() => JSX.Element>;
  label: string;
  sections: LegalSection[];
}

export type LegalTexts = Record<string, LegalTextConfig>;

export type LegalSubject = keyof typeof legalConfig;

/**
 * Config to set legal text components to be used in Legal page.
 * Sections are defined statically to avoid DOM scanning.
 */
export const legalConfig = {
  privacy: {
    component: lazy(() => import('~/modules/marketing/legal/privacy-text')),
    label: 'common:privacy_policy',
    sections: [
      { id: 'overview', label: null },
      { id: 'introduction', label: 'Introduction' },
      { id: 'information-collections', label: 'Information we store' },
      { id: 'use-of-information', label: 'Information use' },
      { id: 'personal-information-sharing', label: 'Personal information sharing' },
      { id: 'security', label: 'Security' },
      { id: 'information-access', label: 'Information access' },
      { id: 'personal-options', label: 'Delete information' },
      { id: 'changes-privacy-policy', label: 'Privacy policy changes' },
      { id: 'subprocessors', label: 'Subprocessors' },
      { id: 'shared-data-types', label: 'Shared Data' },
    ],
  },
  terms: {
    component: lazy(() => import('~/modules/marketing/legal/terms-text')),
    label: 'common:terms_of_use',
    sections: [
      { id: 'overview', label: null },
      { id: 'introduction', label: 'Introduction' },
      { id: 'contract', label: 'Contract' },
      { id: 'privacy', label: 'Privacy' },
      { id: 'sign-up', label: 'Sign up' },
      { id: 'basic-use', label: 'Basic use' },
      { id: 'intellectual-property', label: 'Intellectual property' },
      { id: 'change-of-the-services', label: 'Service changes' },
      { id: 'delete-account', label: 'Account deletion' },
      { id: 'warranty-disclaimer', label: 'Warranty disclaimer' },
      { id: 'limitation-of-liability', label: 'Limitation of liability' },
      { id: 'indemnity', label: 'Indemnity' },
      { id: 'assignment', label: 'Assignment' },
      { id: 'choice-of-law-arbitration', label: 'Choice of law, arbitration' },
      { id: 'miscellaneous', label: 'Miscellaneous' },
    ],
  },
} as const satisfies LegalTexts;
