import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { cn } from '~/utils/cn';

export function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger({ render, nativeButton = !render, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" nativeButton={nativeButton} render={render} {...props} />;
}

/** `animated` (the default) animates the height from `md` only: below it the keyframes, which run on the main thread, drop frames while the panel mounts its content and relayout what stacks under it. */
export function CollapsibleContent({ animated = true, className, ...props }: CollapsiblePrimitive.Panel.Props & { animated?: boolean }) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      className={cn(
        animated && 'md:motion-safe:data-closed:animate-collapsible-up md:motion-safe:data-open:animate-collapsible-down overflow-hidden',
        className,
      )}
      {...props}
    />
  );
}
