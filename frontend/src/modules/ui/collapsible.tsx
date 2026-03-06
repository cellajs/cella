import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

export function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props & React.RefAttributes<HTMLDivElement>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

export function CollapsibleTrigger({
  render,
  ...props
}: CollapsiblePrimitive.Trigger.Props & React.RefAttributes<HTMLButtonElement>) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" nativeButton={!render} render={render} {...props} />
  );
}

export function CollapsibleContent({
  ...props
}: CollapsiblePrimitive.Panel.Props & React.RefAttributes<HTMLDivElement>) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}
