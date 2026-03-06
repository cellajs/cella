import { toast } from 'sonner';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning' | 'default';

/**
 * Show a toast message
 * @param text
 * @param type
 * @param options Pass an id to update an existing toast
 */
export const toaster = (
  text: string,
  type: ToastSeverity = 'default',
  options: { id?: number | string; description?: string | React.ReactNode } = {},
) => {
  // Get all active toasts and dismiss the ones with the same title
  for (const existingToast of toast.getToasts()) {
    if ('title' in existingToast && existingToast.title !== text) continue;
    toast.dismiss(existingToast.id); // Dismiss the toast with the same title
  }

  // Determine toast function based on type
  const toastFn =
    {
      success: toast.success,
      error: toast.error,
      info: toast.info,
      warning: toast.warning,
      default: toast,
    }[type] || toast;

  toastFn(text, options);
};
