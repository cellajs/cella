import type * as TooltipPrimitive from '@radix-ui/react-tooltip';
import React from 'react';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
  ({ children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, className, hideWhenDetached, portal = true, ...props }, ref) => {
    if (disabled) return children;

    return (
      <Tooltip>
        <TooltipTrigger className={className} asChild>
          {/* biome-ignore lint/suspicious/noExplicitAny: <explanation> */}
          {React.cloneElement(children, { ref: ref as any })}
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
