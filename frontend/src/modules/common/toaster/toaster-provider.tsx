import { useEffect } from 'react';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useToastStore } from '~/modules/common/toaster/toast-store';
import { toaster } from '~/modules/common/toaster/toaster';
import { Toaster } from '~/modules/ui/sonner';

export const ToasterProvider = () => {
  const isMobile = useBreakpointBelow('sm');
  const toast = useToastStore((state) => state.toast);
  const clearToast = useToastStore((state) => state.clearToast);

  const toastPosition = isMobile ? 'top-center' : 'bottom-right';

  useEffect(() => {
    if (!toast) return;
    toaster(toast.message, toast.severity);
    clearToast();
  }, [toast]);

  return <Toaster richColors toastOptions={{ className: 'max-sm:mb-16' }} position={toastPosition} />;
};
