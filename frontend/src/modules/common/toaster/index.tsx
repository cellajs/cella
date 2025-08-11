import { useEffect } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { toaster } from '~/modules/common/toaster/service';
import { Toaster } from '~/modules/ui/sonner';
import { useToastStore } from '~/store/toast';

export const ToastManager = () => {
  const isMobile = useBreakpoints('max', 'sm');
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
