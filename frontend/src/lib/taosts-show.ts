import { toast } from 'sonner';

const toastMap = new Map<string, string | number>();

export const showToast = (
  text: string,
  type: 'success' | 'error' | 'info' | 'default' = 'default',
  options: {
    id?: number | string;
  } = {},
) => {
  const existingToastId = toastMap.get(text);

  // Dismiss the previous toast if already exist
  if (existingToastId) toast.dismiss(existingToastId);

  let newToastId: string | number;

  // Handle different toast types
  switch (type) {
    case 'success':
      newToastId = toast.success(text, options);
      break;
    case 'error':
      newToastId = toast.error(text, options);
      break;
    case 'info':
      newToastId = toast.info(text, options);
      break;
    default:
      newToastId = toast(text, options);
  }

  toastMap.set(text, newToastId);
};
