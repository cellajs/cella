import type { ReactNode } from 'react';
import type { TokenInvitation } from '~/modules/auth/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';

interface AuthHeaderProps {
  title: string;
  image?: ReactNode;
  /** Rendered before `children`. */
  description?: ReactNode;
  children?: ReactNode;
}

/** The title block of every auth page and step, with the page's one heading. */
export function AuthHeader({ title, image, description, children }: AuthHeaderProps) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      {image}
      <h1 className="text-2xl">{title}</h1>
      {description && <p className="font-light">{description}</p>}
      {children}
    </header>
  );
}

export function InvitationAvatar({ invitation }: { invitation: TokenInvitation }) {
  return <EntityAvatar type={invitation.entityType} name={invitation.entityName} className="size-14" />;
}
