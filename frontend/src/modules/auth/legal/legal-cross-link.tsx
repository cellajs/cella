import { Link } from '@tanstack/react-router';
import { createContext, type ReactNode, use } from 'react';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import { InlineLinkButton } from '~/modules/common/inline-link-button';

/** Null on the `/legal` page itself, where cross-links fall back to router links. */
const LegalDialogNavContext = createContext<((subject: LegalSubject) => void) | null>(null);

export const LegalDialogNavProvider = LegalDialogNavContext.Provider;

export function LegalCrossLink({ subject, children }: { subject: LegalSubject; children: ReactNode }) {
  const navigateInDialog = use(LegalDialogNavContext);

  if (navigateInDialog) return <InlineLinkButton onClick={() => navigateInDialog(subject)}>{children}</InlineLinkButton>;

  return (
    <Link to="/legal" hash={subject}>
      {children}
    </Link>
  );
}
