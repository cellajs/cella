import { useMountedState } from '~/hooks/use-mounted-state';
import { Spinner as SpinnerIcon } from '~/modules/ui/spinner';
import { cn } from '~/utils/cn';

const sizes = { sm: 'size-4', md: 'size-8', lg: 'size-12' };

interface SpinnerProps {
  /** `sm` in a button or input, `lg` alone on a screen, sheet or dialog. */
  size?: keyof typeof sizes;
  className?: string;
  noDelay?: boolean;
}

export function Spinner({ size = 'md', className, noDelay = false }: SpinnerProps) {
  const { hasStarted } = useMountedState();

  return (
    <div data-started={hasStarted} data-delay={noDelay} className="transition-opacity duration-300 data-[started=false]:data-[delay=false]:opacity-0">
      <SpinnerIcon className={cn('text-foreground mx-auto opacity-50', sizes[size], className)} />
    </div>
  );
}
