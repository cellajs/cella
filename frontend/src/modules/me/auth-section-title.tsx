import type { ReactNode } from 'react';
import { HelpText } from '~/modules/common/help-text';

interface AuthSectionTitleProps {
  title: string;
  help: string;
  /** Follows the title, before the help toggle. */
  children?: ReactNode;
  /** An action for the section, at the end of the row. */
  action?: ReactNode;
}

/** A section heading of the authentication card, its help text behind a toggle. */
export function AuthSectionTitle({ title, help, children, action }: AuthSectionTitleProps) {
  return (
    <HelpText content={help} action={action} className="mb-3">
      <h3 className="group-label text-xs">{title}</h3>
      {children}
    </HelpText>
  );
}
