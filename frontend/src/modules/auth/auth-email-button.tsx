import { ChevronDownIcon } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface AuthEmailButtonProps {
  email: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function AuthEmailButton({ email, onClick, disabled, className = '' }: AuthEmailButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className={cn('group mx-auto flex max-w-full truncate bg-foreground/10 font-normal sm:text-lg', className)}
    >
      <span className="truncate">{email}</span>
      <ChevronDownIcon className="ml-1 group-disabled:hidden" />
    </Button>
  );
}
