import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';

export function LegalText({ subject }: { subject: LegalSubject }) {
  const { component: SubjectText } = legalConfig[subject];
  return (
    <div className="prose dark:prose-invert max-w-none text-foreground">
      <SubjectText />
    </div>
  );
}
