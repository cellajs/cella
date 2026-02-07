import { Loader2Icon } from 'lucide-react';
import { useMountedState } from '~/hooks/use-mounted-state';
import { cn } from '~/utils/cn';

export function Spinner({ className = '', noDelay = false }) {
  const { hasStarted } = useMountedState();

  return (
    <div
      data-started={hasStarted}
      data-delay={noDelay}
      className="duration-300 transition-all data-[started=false]:data-[delay=false]:opacity-0 group"
    >
      <Loader2Icon className={cn('opacity-50 text-foreground mx-auto h-6 w-6 animate-spin', className)} />
    </div>
  );
}
