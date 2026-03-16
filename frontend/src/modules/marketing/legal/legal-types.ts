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
  dataSubjects: string[];
  purposes: string[];
  country: string;
  dpa: {
    signed: boolean;
    effectiveDate: string;
    url: string;
  };
  riskRating: 'low' | 'medium' | 'high';
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
