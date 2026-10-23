import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface ConnectedStatusProps {
  /** The method's own icon, ahead of the check. */
  icon: ReactNode;
  children: ReactNode;
}

/** Takes the place of a sign-in method's connect button once it is connected. */
export function ConnectedStatus({ icon, children }: ConnectedStatusProps) {
  return (
    // The icons keep their size while the text wraps
    <div className="flex items-center justify-center gap-3 px-3 py-2 [&>img]:shrink-0 [&>svg]:shrink-0">
      {icon}
      <CheckIcon strokeWidth={3} className="size-4.5 text-success" />
      {children}
    </div>
  );
}
