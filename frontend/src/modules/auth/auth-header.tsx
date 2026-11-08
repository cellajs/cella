import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TokenInvitation } from '~/modules/auth/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Button } from '~/modules/ui/button';

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

interface AuthEmailButtonProps {
  email: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AuthEmailButton({ email, onClick, disabled }: AuthEmailButtonProps) {
  return (
    <Button
      variant="glass"
      onClick={onClick}
      disabled={disabled}
      className="group/email-button h-12 max-w-full gap-2.5 rounded-full px-6 font-normal sm:text-lg"
    >
      <MiddleCut text={email} />
      <ChevronDownIcon className="transition-transform group-hover/email-button:translate-y-0.5 group-disabled/email-button:hidden" />
    </Button>
  );
}
