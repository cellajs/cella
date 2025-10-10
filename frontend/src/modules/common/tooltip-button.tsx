import type * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  // biome-ignore lint/suspicious/noExplicitAny: unable to infer type due to dynamic data structure
  children: React.ReactElement<{ ref?: React.Ref<any> }>;
  toolTipContent: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  hideWhenDetached?: boolean;
  portal?: boolean;
}

/**
 * A button that displays a tooltip when hovered.
 */
export const TooltipButton = React.forwardRef<HTMLDivElement, TooltipButtonProps>(
  ({ children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, className, hideWhenDetached, portal = true, ...props }, _ref) => {
    if (disabled) return children;

    const content = (
      <TooltipContent side={side} {...props} sideOffset={sideOffset} hideWhenDetached={hideWhenDetached}>
        {toolTipContent}
      </TooltipContent>
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={className}>{children}</div>
        </TooltipTrigger>
        {portal ? <TooltipPortal>{content}</TooltipPortal> : content}
      </Tooltip>
    );
  },
);
