import { ChevronDownIcon } from 'lucide-react';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Button } from '~/modules/ui/button';

interface AuthEmailButtonProps {
  email: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AuthEmailButton({ email, onClick, disabled }: AuthEmailButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="group/email-button max-w-full bg-foreground/10 font-normal hover:bg-foreground/15 sm:text-lg"
    >
      <MiddleCut text={email} />
      <ChevronDownIcon className="group-disabled/email-button:hidden" />
    </Button>
  );
}
