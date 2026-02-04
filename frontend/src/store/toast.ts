import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ToastSeverity } from '~/modules/common/toaster/service';

interface ToastData {
  message: string;
  severity: ToastSeverity;
}

interface ToastStore {
  toast: ToastData | null;
  showToast: (message: string, severity: ToastSeverity) => void;
  clearToast: () => void;
}

export const useToastStore = create<ToastStore>()(
  persist(
    (set) => ({
      toast: null,
      showToast: (message, severity) => set({ toast: { message, severity } }),
      clearToast: () => set({ toast: null }),
    }),
    {
      version: 1,
      name: `${appConfig.slug}-toasts`,
      partialize: (state) => ({ toast: state.toast }),
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
