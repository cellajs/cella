import { Link } from '@tanstack/react-router';
import { createContext, type ReactNode, use } from 'react';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';
import { InlineLinkButton } from '~/modules/common/inline-link-button';

/** Null on the `/legal` page itself, where cross-links fall back to router links. */
const LegalDialogNavContext = createContext<((subject: LegalSubject) => void) | null>(null);

export const LegalDialogNavProvider = LegalDialogNavContext.Provider;

interface LegalCrossLinkProps {
  subject: LegalSubject;
  children: ReactNode;
}

export function LegalCrossLink({ subject, children }: LegalCrossLinkProps) {
  const navigateInDialog = use(LegalDialogNavContext);

  if (navigateInDialog) {
    return <InlineLinkButton onClick={() => navigateInDialog(subject)}>{children}</InlineLinkButton>;
  }

  return (
    <Link to="/legal" hash={subject}>
      {children}
    </Link>
  );
}
