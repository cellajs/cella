import { Toggle as TogglePrimitive } from '@base-ui/react/toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '~/utils/cn';

const toggleVariants = cva(
  'focus-effect active:press inline-flex items-center justify-center rounded-md bg-transparent font-medium text-sm transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-pressed:inset-ring data-pressed:inset-ring-input data-pressed:bg-muted data-pressed:text-foreground',
  {
    variants: {
      size: {
        default: 'h-10 px-3',
        sm: 'h-9 px-2.5',
      },
    },
    defaultVariants: { size: 'default' },
  },
);

export function Toggle({
  className,
  size,
  value,
  ...props
}: Omit<TogglePrimitive.Props, 'value'> & VariantProps<typeof toggleVariants> & { value?: string | number | readonly string[] }) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ size, className }))}
      value={value != null ? String(value) : undefined}
      {...props}
    />
  );
}
