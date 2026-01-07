import type { JSX } from 'react';
import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';

export type LegalTexts = Record<string, { component: React.LazyExoticComponent<() => JSX.Element>; label: string }>;

/**
 * Component to render legal text based on the given subject.
 */
const LegalText = ({ subject }: { subject: LegalSubject }) => {
  const { component: SubjectText } = legalConfig[subject];
  return <SubjectText />;
};

export default LegalText;
