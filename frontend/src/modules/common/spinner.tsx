import { LoaderCircleIcon } from 'lucide-react';
import { useMountedState } from '~/hooks/use-mounted-state';
import { cn } from '~/utils/cn';

export function Spinner({ className = '', noDelay = false }) {
  const { hasStarted } = useMountedState();

  return (
    <div
      data-started={hasStarted}
      data-delay={noDelay}
      className="group transition-all duration-300 data-[started=false]:data-[delay=false]:opacity-0"
    >
      <LoaderCircleIcon className={cn('mx-auto h-6 w-6 animate-spin text-foreground opacity-50', className)} />
    </div>
  );
}
