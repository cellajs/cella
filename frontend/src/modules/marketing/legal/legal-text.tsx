import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';

/**
 * Component to render legal text based on the given subject.
 */
export function LegalText({ subject }: { subject: LegalSubject }) {
  const { component: SubjectText } = legalConfig[subject];
  return <SubjectText />;
}
