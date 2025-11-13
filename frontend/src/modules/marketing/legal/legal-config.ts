export const coreSubjects = ['terms', 'privacy'] as const satisfies LegalSubject[];

export type LegalSubject = 'privacy' | 'terms';
export type CoreLegalSubject = Extract<LegalSubject, 'privacy' | 'terms'>;

export const subjectLabels = {
  terms: 'common:terms_of_use',
  privacy: 'common:privacy_policy',
} as const satisfies Record<LegalSubject, string>;
