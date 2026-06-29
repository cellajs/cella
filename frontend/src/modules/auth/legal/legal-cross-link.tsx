import { Link } from '@tanstack/react-router';
import { createContext, type ReactNode, use } from 'react';
import type { LegalSubject } from '~/modules/auth/legal/legal-config';

/**
 * When legal texts are rendered inside the legal dialog, this context provides a handler
 * to switch the dialog content between subjects (terms <-> privacy) instead of navigating
 * away to the `/legal` page. On the legal page itself the context is absent, so cross-links
 * fall back to regular router links.
 */
const LegalDialogNavContext = createContext<((subject: LegalSubject) => void) | null>(null);

export const LegalDialogNavProvider = LegalDialogNavContext.Provider;

/**
 * Cross-link between legal subjects. Renders a button that swaps the dialog content when
 * inside the legal dialog, or a router link to the legal page otherwise.
 */
export function LegalCrossLink({ subject, children }: { subject: LegalSubject; children: ReactNode }) {
  const navigateInDialog = use(LegalDialogNavContext);

  if (navigateInDialog) {
    return (
      <button
        type="button"
        className="cursor-pointer font-medium text-primary underline"
        onClick={() => navigateInDialog(subject)}
      >
        {children}
      </button>
    );
  }

  return (
    <Link to="/legal" hash={subject}>
      {children}
    </Link>
  );
}
