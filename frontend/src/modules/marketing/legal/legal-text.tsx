import { JSX, Suspense } from 'react';
import Spinner from '~/modules/common/spinner';
import { type LegalSubject, legalConfig } from '~/modules/marketing/legal/legal-config';

export type LegalTexts = Record<string, { component: React.LazyExoticComponent<() => JSX.Element>; label: string }>;

/**
 * Component to render legal text based on the given subject.
 */
const LegalText = ({ subject }: { subject: LegalSubject }) => {
  const { component: SubjectText } = legalConfig[subject];

  return (
    <Suspense fallback={<Spinner className="mt-[20vh] h-10 w-10" />}>
      <SubjectText />
    </Suspense>
  );
};

export default LegalText;
