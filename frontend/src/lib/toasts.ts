import { toast } from 'sonner';

const toastMap = new Map<string, string | number>();

export const showToast = (
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
