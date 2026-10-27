import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';
import { tw } from '~/utils/tw';

/** A panel class that animates the height from `md` only: below it the keyframes, which run on the main thread, drop frames while the panel mounts its content and relayout what stacks under it. */
export const collapsiblePanelClass = tw(
  'overflow-hidden md:motion-safe:data-closed:animate-collapsible-up md:motion-safe:data-open:animate-collapsible-down',
);

export function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger({ render, nativeButton = !render, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" nativeButton={nativeButton} render={render} {...props} />;
}

export function CollapsibleContent({ ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}
