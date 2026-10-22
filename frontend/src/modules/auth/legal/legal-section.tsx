import type { ReactNode } from 'react';
import { type LegalSubject, legalConfig } from '~/modules/auth/legal/legal-config';
import { legalOverviewId } from '~/modules/auth/legal/legal-types';
import { cn } from '~/utils/cn';

interface LegalSectionProps<S extends LegalSubject> {
  subject: S;
  id: (typeof legalConfig)[S]['sections'][number]['id'];
  /** The overview's "Last updated" date, written out. */
  lastUpdated?: string;
  children: ReactNode;
}

/** A section of a legal text, labelled as its subject's config declares it. */
export function LegalSection<S extends LegalSubject>({ subject, id, lastUpdated, children }: LegalSectionProps<S>) {
  const label = legalConfig[subject].sections.find((section) => section.id === id)?.label ?? null;
  // No id on the overview: its anchor sits on the page wrapper, and an id names one element.
  const isOverview = id === legalOverviewId;

  return (
    <section id={isOverview ? undefined : `spy-${id}`} aria-label={label ?? undefined} className={cn(!isOverview && 'mb-4 pt-4')}>
      {label && <h3>{label}</h3>}
      {lastUpdated && <p className="text-muted-foreground text-sm">Last updated: {lastUpdated}</p>}
      {children}
    </section>
  );
}
