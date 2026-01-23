import { XIcon } from 'lucide-react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const sizeConfig = {
  sm: { icon: 16, button: 'size-6' },
  md: { icon: 20, button: 'size-7' },
  lg: { icon: 24, button: 'size-8' },
} as const;

interface CloseButtonProps {
  onClick: () => void;
  size?: keyof typeof sizeConfig;
  className?: string;
}

/** Reusable close/dismiss button with X icon. */
function CloseButton({ onClick, size = 'md', className }: CloseButtonProps) {
  const { icon, button } = sizeConfig[size];

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(button, 'opacity-70 hover:opacity-100', className)}
      onClick={onClick}
    >
      <XIcon size={icon} strokeWidth={1.5} />
    </Button>
  );
}

export default CloseButton;
