import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps {
  children: ReactElement<{ 'aria-label'?: string; children?: ReactNode }>;
  toolTipContent: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  hideWhenDetached?: boolean;
  className?: string;
}

/** Whether a node renders text of its own; an icon-only trigger has none. */
function hasText(node: ReactNode): boolean {
  return Children.toArray(node).some(
    (child) =>
      typeof child === 'string' || typeof child === 'number' || (isValidElement<{ children?: ReactNode }>(child) && hasText(child.props.children)),
  );
}

export function TooltipButton({
  children,
  toolTipContent,
  disabled,
  side = 'bottom',
  sideOffset = 8,
  className,
  hideWhenDetached,
}: TooltipButtonProps) {
  // An icon-only trigger takes its accessible name from the tooltip; visible text stays the name otherwise
  const { 'aria-label': ownLabel, children: triggerContent } = children.props;
  const labelled = ownLabel !== undefined || hasText(triggerContent) ? children : cloneElement(children, { 'aria-label': toolTipContent });

  const trigger = disabled ? (
    labelled
  ) : (
    <Tooltip>
      <TooltipTrigger render={labelled} />
      <TooltipContent side={side} sideOffset={sideOffset} hideWhenDetached={hideWhenDetached}>
        {toolTipContent}
      </TooltipContent>
    </Tooltip>
  );

  if (className) return <span className={className}>{trigger}</span>;
  return trigger;
}
