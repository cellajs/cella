import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { toastManager } from '~/modules/common/toaster/toaster';
import { Toaster } from '~/modules/ui/toast';

/** Mounts the app's toast stack: top center on small screens, bottom right from `sm` up. */
export function ToasterProvider() {
  const isMobile = useBreakpointBelow('sm');

  return <Toaster toastManager={toastManager} timeout={4000} position={isMobile ? 'top' : 'bottom'} />;
}
