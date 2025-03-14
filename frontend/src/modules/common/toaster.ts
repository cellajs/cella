import { toast } from 'sonner';

/**
 * Show a toast message
 * @param text
 * @param type
 * @param options Pass an id to update an existing toast
 */
export const toaster = (
  text: string,
  type: 'success' | 'error' | 'info' | 'warning' | 'default' = 'default',
  options: { id?: number | string } = {},
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
