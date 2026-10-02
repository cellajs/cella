import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { t } from 'i18next';
import { CircleCheckIcon, InfoIcon, LoaderCircleIcon, OctagonXIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/** Screen edge the toast stack grows from. */
export type ToastPosition = 'top' | 'bottom';

const toastIcons: Record<string, ReactNode> = {
  success: <CircleCheckIcon className="text-success" />,
  info: <InfoIcon />,
  warning: <TriangleAlertIcon className="text-warning" />,
  error: <OctagonXIcon className="text-destructive" />,
  loading: <LoaderCircleIcon className="animate-spin" />,
};

// Stacking and swipe transforms follow the shadcn base toast. `--toast-dir` (1 for bottom, -1 for top, set on the
// viewport) flips every vertical offset, so one class list serves both edges.
const toastRootClassName = cn(
  'group/toast focus-effect pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom select-none rounded-lg border bg-popover text-popover-foreground shadow-lg will-change-transform',
  'group-data-[position=top]/toast-viewport:top-0 group-data-[position=top]/toast-viewport:bottom-auto group-data-[position=top]/toast-viewport:origin-top',
  '[--gap:0.75rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-dir)*-1*(var(--toast-offset-y)+var(--toast-index)*var(--gap))+var(--toast-swipe-movement-y))] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))]',
  'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-var(--toast-dir)*(var(--toast-index)*var(--peek)+var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]',
  // Bridges the gap to the next toast so the expanded stack stays hovered
  "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-[''] group-data-[position=top]/toast-viewport:after:top-auto group-data-[position=top]/toast-viewport:after:bottom-full",
  'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
  'data-limited:opacity-0 data-starting-style:[transform:translateY(calc(var(--toast-dir)*150%))]',
  '[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(calc(var(--toast-dir)*150%))]',
  'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
  'data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
  'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
  'data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
  'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
  'data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]',
  'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
  'data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]',
);

function ToastList({ position }: { position: ToastPosition }) {
  const { toasts } = ToastPrimitive.useToastManager();
  const swipeDirection: ToastPrimitive.Root.Props['swipeDirection'] = position === 'top' ? ['up', 'right'] : ['down', 'right'];

  return toasts.map((toast) => (
    <ToastPrimitive.Root key={toast.id} toast={toast} swipeDirection={swipeDirection} data-slot="toast" className={toastRootClassName}>
      <ToastPrimitive.Content
        data-slot="toast-content"
        className="flex h-full items-center gap-3 overflow-hidden p-4 transition-opacity duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] data-behind:opacity-0 data-expanded:opacity-100"
      >
        {toast.type && toastIcons[toast.type] && (
          <span data-slot="toast-icon" className="shrink-0 [&_svg]:pointer-events-none">
            {toastIcons[toast.type]}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <ToastPrimitive.Title data-slot="toast-title" className="font-medium text-sm" />
          <ToastPrimitive.Description data-slot="toast-description" render={<div />} className="text-muted-foreground text-sm" />
        </div>
        <ToastPrimitive.Action data-slot="toast-action" render={<Button variant="outline" size="xs" />} className="shrink-0" />
        <ToastPrimitive.Close
          data-slot="toast-close"
          aria-label={t('c:close')}
          render={<Button variant="ghost" size="xs" />}
          className="relative shrink-0 text-muted-foreground after:absolute after:-inset-2 after:content-[''] hover:text-foreground"
        >
          <XIcon />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  ));
}

/**
 * Renders the toasts of `toastManager` in a stack at the top or bottom edge. Toasts carry their own
 * icon per `type`, a close button and an optional action. Ported from the shadcn base toast.
 */
export function Toaster({ children, position = 'bottom', ...props }: ToastPrimitive.Provider.Props & { position?: ToastPosition }) {
  return (
    <ToastPrimitive.Provider {...props}>
      {children}
      <ToastPrimitive.Portal data-slot="toast-portal">
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          data-position={position}
          className={cn(
            'group/toast-viewport pointer-events-none fixed inset-x-4 z-500 mx-auto w-auto max-w-115 outline-hidden [--toast-dir:1] sm:right-4 sm:left-auto sm:mx-0 sm:w-full',
            'data-[position=top]:top-[calc(1rem+env(safe-area-inset-top,0px))] data-[position=bottom]:bottom-4 data-[position=top]:[--toast-dir:-1]',
          )}
        >
          <ToastList position={position} />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
