import type { ReactNode } from 'react';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { legalOverviewId } from '~/modules/auth/legal/legal-types';

interface LegalSectionProps<S extends LegalSubject> {
  subject: S;
  id: (typeof legalConfig)[S]['sections'][number]['id'];
  children: ReactNode;
}

/** A section of a legal text, labelled as its subject's config declares it. */
export function LegalSection<S extends LegalSubject>({ subject, id, children }: LegalSectionProps<S>) {
  const label = legalConfig[subject].sections.find((section) => section.id === id)?.label ?? null;
  // The page wrapper carries the overview's spy anchor, so it reaches up past the subject title. One id, one element.
  const isOverview = id === legalOverviewId;

  return (
    <section id={isOverview ? undefined : `spy-${id}`} aria-label={label ?? undefined} className={isOverview ? '' : 'mb-4 pt-4'}>
      {label && <h3>{label}</h3>}
      {children}
    </section>
  );
}
