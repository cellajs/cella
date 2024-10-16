import type * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  children: React.ReactElement;
  toolTipContent: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  hideWhenDetached?: boolean;
  portal?: boolean;
}

export const TooltipButton = React.forwardRef<HTMLDivElement, TooltipButtonProps>(
  ({ children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, className, hideWhenDetached, portal = true, ...props }, ref) => {
    if (disabled) return children;

    return (
      <Tooltip>
        <TooltipTrigger className={className} asChild>
          {React.cloneElement(children, { ref })}
        </TooltipTrigger>
        {portal ? (
          <TooltipPortal>
            <TooltipContent side={side} {...props} sideOffset={sideOffset} hideWhenDetached={hideWhenDetached}>
              {toolTipContent}
            </TooltipContent>
          </TooltipPortal>
        ) : (
          <TooltipContent side={side} {...props} sideOffset={sideOffset} hideWhenDetached={hideWhenDetached}>
            {toolTipContent}
          </TooltipContent>
        )}
      </Tooltip>
    );
  },
);

TooltipButton.displayName = 'TooltipButton';
