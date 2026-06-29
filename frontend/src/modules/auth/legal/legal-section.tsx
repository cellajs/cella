import type { ReactNode } from 'react';

interface LegalSectionProps {
  id: string;
  label: string | null;
  children: ReactNode;
}

export function LegalSection({ id, label, children }: LegalSectionProps) {
  const isOverview = label === null;

  return (
    <section id={`spy-${id}`} aria-label={label ?? undefined} className={isOverview ? '' : 'mb-4 pt-4'}>
      {label && <h3 className="font-medium">{label}</h3>}
      {children}
    </section>
  );
}
