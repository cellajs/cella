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
    <Button variant="secondary" onClick={onClick} disabled={disabled} className="group/email-button max-w-full font-normal sm:text-lg">
      <MiddleCut text={email} />
      <ChevronDownIcon className="group-disabled/email-button:hidden" />
    </Button>
  );
}
