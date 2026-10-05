import type { JSX } from 'react';

/**
 * Id of every subject's first section: the text above the first heading. The page wrapper carries its spy anchor, so
 * a jump to it brings the subject title into view, the way the docs' `PAGE_SECTION_ID` wraps a page's own heading.
 */
export const LEGAL_OVERVIEW_ID = 'overview';

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
  /** Day of the report as `YYYY-MM-DD`. */
  date: string;
  /** Downloadable PDF, under `/static`. */
  pdfUrl: string;
}

/** How many success criteria of the standard ended in each outcome; together they add up to all of them. */
export interface AccessibilityResults {
  /** Pages and states the review covered. */
  pagesAndStates: number;
  supports: number;
  partiallySupports: number;
  doesNotSupport: number;
  notApplicable: number;
  /** Criteria nobody could evaluate yet, e.g. `['4.1.2 Name, Role, Value']`. */
  notEvaluated: string[];
}

export interface AccessibilityReview {
  standard: string;
  /** Day of the last review as `YYYY-MM-DD`. Null until the first review is done. */
  reviewedAt: string | null;
  /** True while no person confirmed the results: the statement then calls them provisional and the report a draft. */
  provisional?: boolean;
  results?: AccessibilityResults;
  limitations: AccessibilityLimitation[];
  report: AccessibilityReport | null;
}
