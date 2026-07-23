import { toast } from 'sonner';

/** Visual toast variants accepted by the persisted toast store. */
export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

type ToastMessage = Parameters<typeof toast>[0];
type ToastOptions = Parameters<typeof toast>[1];
type ToastMethod = (message: ToastMessage, options?: ToastOptions) => string | number;

/** Add a stable id for string messages so repeated calls update one active toast. */
function withMessageDeduplication(method: ToastMethod): ToastMethod {
  return (message, options) => {
    if (options?.id !== undefined || typeof message !== 'string') return method(message, options);
    return method(message, { ...options, id: `cella:${message}` });
  };
}

const showToast = withMessageDeduplication(toast);

/** Sonner-compatible toast API with Cella's duplicate-message suppression. */
export const toaster = Object.assign(showToast, {
  success: withMessageDeduplication(toast.success),
  info: withMessageDeduplication(toast.info),
  warning: withMessageDeduplication(toast.warning),
  error: withMessageDeduplication(toast.error),
  loading: withMessageDeduplication(toast.loading),
  message: withMessageDeduplication(toast.message),
  custom: toast.custom,
  promise: toast.promise,
  dismiss: toast.dismiss,
  getHistory: toast.getHistory,
  getToasts: toast.getToasts,
}) satisfies typeof toast;
