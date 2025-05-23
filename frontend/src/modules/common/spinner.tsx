import { Loader2 } from 'lucide-react';
import useMounted from '~/hooks/use-mounted';
import { cn } from '~/utils/cn';

const Spinner = ({ className = '', noDelay = false }) => {
  const { hasStarted } = useMounted();

  return (
    <div
      data-started={hasStarted}
      data-delay={noDelay}
      className="duration-300 transition-all data-[started=false]:data-[delay=false]:opacity-0 group"
    >
      <Loader2 className={cn('text-muted-foreground mx-auto h-6 w-6 animate-spin', className)} />
    </div>
  );
};

export default Spinner;
