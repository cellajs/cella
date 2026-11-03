import { ChevronDownIcon } from 'lucide-react';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Button } from '~/modules/ui/button';

interface AuthEmailButtonProps {
  email: string;
  onClick: () => void;
  disabled?: boolean;
}

/** A pill like the hero's GitHub button, as it sits over the same kind of backdrop */
export function AuthEmailButton({ email, onClick, disabled }: AuthEmailButtonProps) {
  return (
    <Button
      variant="outline-ghost"
      onClick={onClick}
      disabled={disabled}
      className="group/email-button h-12 max-w-full gap-2.5 rounded-full px-6 font-normal backdrop-blur-xs sm:text-lg"
    >
      <MiddleCut text={email} />
      <ChevronDownIcon className="transition-transform group-hover/email-button:translate-y-0.5 group-disabled/email-button:hidden" />
    </Button>
  );
}
