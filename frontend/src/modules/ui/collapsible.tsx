import { Collapsible as CollapsiblePrimitive } from '@base-ui/react/collapsible';

/** Renders the styled collapsible primitive. */
export function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props & React.RefAttributes<HTMLDivElement>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/** Renders the styled collapsible trigger primitive. */
export function CollapsibleTrigger({
  render,
  nativeButton = !render,
  ...props
}: CollapsiblePrimitive.Trigger.Props & React.RefAttributes<HTMLButtonElement>) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      nativeButton={nativeButton}
      render={render}
      {...props}
    />
  );
}

/** Renders the styled collapsible content primitive. */
export function CollapsibleContent({
  ...props
}: CollapsiblePrimitive.Panel.Props & React.RefAttributes<HTMLDivElement>) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" {...props} />;
}
