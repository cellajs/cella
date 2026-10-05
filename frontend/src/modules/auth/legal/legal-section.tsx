import type { ReactNode } from 'react';
import { LEGAL_OVERVIEW_ID } from '~/modules/auth/legal/legal-types';

interface LegalSectionProps {
  id: string;
  label: string | null;
  children: ReactNode;
}

export function LegalSection({ id, label, children }: LegalSectionProps) {
  // The page wrapper carries the overview's spy anchor, so it reaches up past the subject title. One id, one element.
  const isOverview = id === LEGAL_OVERVIEW_ID;

  return (
    <section id={isOverview ? undefined : `spy-${id}`} aria-label={label ?? undefined} className={isOverview ? '' : 'mb-4 pt-4'}>
      {label && <h3 className="font-medium">{label}</h3>}
      {children}
    </section>
  );
}
