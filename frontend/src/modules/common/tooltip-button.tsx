import React from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps {
  // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
  children: React.ReactElement<{ ref?: React.Ref<any> }>;
  toolTipContent: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  hideWhenDetached?: boolean;
  portal?: boolean;
  className?: string;
}

/** Whether a node renders text of its own; an icon-only trigger has none. */
function hasText(node: React.ReactNode): boolean {
  return React.Children.toArray(node).some(
    (child) =>
      typeof child === 'string' ||
      typeof child === 'number' ||
      (React.isValidElement<{ children?: React.ReactNode }>(child) && hasText(child.props.children)),
  );
}

export const TooltipButton = React.forwardRef<HTMLDivElement, TooltipButtonProps>(function TooltipButton(
  { children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, className, hideWhenDetached, portal = true, ...props },
  _ref,
) {
  // An icon-only trigger takes its accessible name from the tooltip; visible text stays the name otherwise
  const { 'aria-label': ownLabel, children: triggerContent } = children.props as { 'aria-label'?: string; children?: React.ReactNode };
  const ariaLabel = ownLabel ?? (hasText(triggerContent) ? undefined : toolTipContent);

  if (disabled) return ariaLabel && !ownLabel ? React.cloneElement(children, { 'aria-label': ariaLabel } as object) : children;

  const content = (
    <TooltipContent side={side} {...props} sideOffset={sideOffset} hideWhenDetached={hideWhenDetached}>
      {toolTipContent}
    </TooltipContent>
  );

  const trigger = (
    <Tooltip>
      <TooltipTrigger render={children} aria-label={ariaLabel} />
      {portal ? <TooltipPortal>{content}</TooltipPortal> : content}
    </Tooltip>
  );

  if (className) return <span className={className}>{trigger}</span>;
  return trigger;
});
