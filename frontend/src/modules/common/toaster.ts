import { toast } from 'sonner';

const toastMap = new Map<string, string | number>();

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
  const existingToastId = toastMap.get(text);

  // Dismiss the previous toast if it exists
  if (existingToastId) toast.dismiss(existingToastId);

  // Determine toast function based on type
  const toastFn =
    {
      success: toast.success,
      error: toast.error,
      info: toast.info,
      warning: toast.warning,
      default: toast,
    }[type] || toast;

  const newToastId = toastFn(text, options);

  toastMap.set(text, newToastId);
};
