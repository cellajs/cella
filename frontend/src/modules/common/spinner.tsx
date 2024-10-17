import { Loader2 } from 'lucide-react';
import useMounted from '~/hooks/use-mounted';

const Spinner = ({ inline = false, noDelay = false }) => {
  const { hasStarted } = useMounted();

  return (
    <div
      data-started={hasStarted}
      data-delay={noDelay}
      data-inline={inline}
      className="duration-300 transition-all data-[started=false]:data-[delay=false]:opacity-0 group"
    >
      <Loader2 className="text-muted-foreground mx-auto group-data-[inline=true]:h-6 w-6 group-data-[inline=false]:mt-[40vh] h-10 w-10  animate-spin" />
    </div>
  );
};

export default Spinner;
