import { Toaster as Sonner } from 'sonner';
import { useUIStore } from '~/modules/ui/ui-store';

type ToasterProps = React.ComponentProps<typeof Sonner>;

export function Toaster({ ...props }: ToasterProps) {
  const mode = useUIStore((state) => state.mode);

  return (
    <Sonner
      theme={mode}
      className="toaster group pointer-events-auto z-500 sm:[--width:460px]!"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
