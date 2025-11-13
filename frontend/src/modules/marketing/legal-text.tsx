import { lazy, Suspense } from 'react';
import type { LegalSubject } from '~/modules/marketing/legal-config';

const legalTexts = {
  terms: lazy(() => import('~/modules/marketing/terms-text')),
  privacy: lazy(() => import('~/modules/marketing/privacy-text')),
} as const satisfies Record<LegalSubject, React.LazyExoticComponent<() => React.JSX.Element>>;

const LegalText = ({ subject }: { subject: LegalSubject }) => {
  const SubjectText = legalTexts[subject];

  return (
    <Suspense fallback={<>Loading…</>}>
      <SubjectText />
    </Suspense>
  );
};

export default LegalText;
