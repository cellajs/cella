import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { toastManager } from '~/modules/common/toaster/toaster';
import { Toaster } from '~/modules/ui/toast';

/**
 * Mounts the app's toast stack: top center on small screens, bottom right from `sm` up. How long a toast stays is
 * decided per toast, in `toaster.ts`.
 */
export function ToasterProvider() {
  const isMobile = useBreakpointBelow('sm');

  return <Toaster toastManager={toastManager} position={isMobile ? 'top' : 'bottom'} />;
}
