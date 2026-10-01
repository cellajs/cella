import { useMountedState } from '~/hooks/use-mounted-state';
import { Spinner as SpinnerIcon } from '~/modules/ui/spinner';
import { cn } from '~/utils/cn';

export function Spinner({ className = '', noDelay = false }) {
  const { hasStarted } = useMountedState();

  return (
    <div data-started={hasStarted} data-delay={noDelay} className="transition-all duration-300 data-[started=false]:data-[delay=false]:opacity-0">
      <SpinnerIcon className={cn('mx-auto size-6 text-foreground opacity-50', className)} />
    </div>
  );
}
