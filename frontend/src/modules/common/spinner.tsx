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

/** Spinner for a page or panel that is still loading, placed near the vertical middle of the viewport. */
export function PageSpinner({ className }: { className?: string }) {
  return <Spinner className={cn('mt-[45vh] size-10', className)} />;
}
