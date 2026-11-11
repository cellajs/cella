import { useDelayedFlag } from '~/hooks/use-delayed-flag';
import { Spinner as SpinnerIcon } from '~/modules/ui/spinner';
import { cn } from '~/utils/cn';

const sizes = { sm: 'size-4', md: 'size-8', lg: 'size-12' };

/** How long a pending state waits before it shows a spinner: a fast answer shows none. */
export const spinnerDelayMs = 300;

interface SpinnerProps {
  /** `sm` in a button or input, `lg` alone on a screen, sheet or dialog. */
  size?: keyof typeof sizes;
  className?: string;
  noDelay?: boolean;
}

export function Spinner({ size = 'md', className, noDelay = false }: SpinnerProps) {
  const held = useDelayedFlag(true, spinnerDelayMs);

  return (
    <div data-shown={noDelay || held} className="transition-opacity duration-300 data-[shown=false]:opacity-0">
      <SpinnerIcon className={cn('text-foreground mx-auto opacity-50', sizes[size], className)} />
    </div>
  );
}

/** The spinner of a page or pane still loading, where its content will be. */
export function PageSpinner() {
  return <Spinner size="lg" className="mt-[45vh]" />;
}
