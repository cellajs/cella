import { Toast, type ToastManager, type ToastManagerAddOptions } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

/** Toast variants with their own icon. */
export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

/** Base UI toast options; the message and severity come from the call. */
export type ToastOptions = Omit<ToastManagerAddOptions<object>, 'title' | 'type'>;

const manager = Toast.createToastManager();
let held: ToastManagerAddOptions<object>[] = [];
let subscriberCount = 0;

/**
 * The manager the app's `Toaster` renders. Toasts shown before any `Toaster` subscribes (a route `beforeLoad` on
 * first load, for instance) are held and replayed to the first subscriber, where a bare manager would drop them.
 */
export const toastManager: ToastManager = {
  ...manager,
  ' subscribe': (listener) => {
    const unsubscribe = manager[' subscribe'](listener);
    subscriberCount += 1;
    for (const options of held.splice(0)) manager.add(options);
    return () => {
      subscriberCount -= 1;
      unsubscribe();
    };
  },
};

function add(options: ToastManagerAddOptions<object>) {
  if (subscriberCount > 0) return manager.add(options);
  const id = options.id ?? crypto.randomUUID();
  held.push({ ...options, id });
  return id;
}

function close(id?: string) {
  if (subscriberCount > 0) return manager.close(id);
  held = id === undefined ? [] : held.filter((options) => options.id !== id);
}

/** A string message gets a stable id, so repeating it refreshes the visible toast. Errors are announced urgently. */
function show(type?: ToastSeverity) {
  return (message: ReactNode, options: ToastOptions = {}) => {
    const id = options.id ?? (typeof message === 'string' ? `toast:${message}` : undefined);
    return add({ priority: type === 'error' ? 'high' : 'low', ...options, id, title: message, type });
  };
}

/** Shows a toast and returns its id: `toaster(message)` plain, `toaster.<severity>(message)` with an icon. */
export const toaster = Object.assign(show(), {
  success: show('success'),
  info: show('info'),
  warning: show('warning'),
  error: show('error'),
  close,
});
