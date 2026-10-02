import type { JSX } from 'react';

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

export interface CollectedDataCategory {
  label: string;
  description: string;
  items: string[];
}

export interface Subprocessor {
  slug: string;
  name: string;
  legalName: string;
  website: string;
  servicesProvided: string[];
  processingActivities: string[];
  categoriesOfPersonalData: string[];
  purposes: string[];
  country: string;
  dpa: { signed: boolean; effectiveDate: string; url: string };
  optional?: boolean;
}

export interface SharedDataType {
  slug: string;
  name: string;
  purpose: string;
  legalBasis: string;
  dataCategories: string[];
  dataSubjects: string[];
  storageLocation: string;
  retentionPeriod: string;
  optional?: boolean;
}

export interface AccessibilityLimitation {
  /** What does not work yet, in plain words. */
  description: string;
  /** WCAG success criteria it fails, e.g. `['2.1.4']`. */
  criteria: string[];
  /** Workaround or planned fix. */
  workaround?: string;
}

export interface AccessibilityReport {
  /** Template edition, e.g. `VPAT® 2.5Rev WCAG`. */
  edition: string;
  date: string;
  /** Downloadable PDF, under `/static`. */
  pdfUrl: string;
}

export interface AccessibilityReview {
  standard: string;
  /** Null until the first review is done. */
  reviewedAt: string | null;
  limitations: AccessibilityLimitation[];
  report: AccessibilityReport | null;
}
