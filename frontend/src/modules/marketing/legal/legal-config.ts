import { lazy } from 'react';
import type { LegalTexts } from './legal-text';

export type LegalSubject = keyof typeof legalConfig;

/**
 * Config to set legal text components to be used in Legal page.
 */
export const legalConfig = {
  privacy: {
    component: lazy(() => import('~/modules/marketing/legal/privacy-text')),
    label: 'common:privacy_policy',
  },
  terms: {
    component: lazy(() => import('~/modules/marketing/legal/terms-text')),
    label: 'common:terms_of_use',
  },
} as const satisfies LegalTexts;
