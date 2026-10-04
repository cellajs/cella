import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { toastManager } from '~/modules/common/toaster/toaster';
import { Toaster } from '~/modules/ui/toast';
import { useUIStore } from '~/modules/ui/ui-store';

/**
 * Mounts the app's toast stack: top center on small screens, bottom right from `sm` up. A toast closes after four
 * seconds, or stays until dismissed for a reader who chose to keep messages open.
 */
export function ToasterProvider() {
  const isMobile = useBreakpointBelow('sm');
  const keepMessages = useUIStore((state) => state.keepMessages);

  return <Toaster toastManager={toastManager} timeout={keepMessages ? 0 : 4000} position={isMobile ? 'top' : 'bottom'} />;
}
