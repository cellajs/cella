import type * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  children: React.ReactNode;
  toolTipContent: string;
  disabled?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  hideWhenDetached?: boolean;
  portal?: boolean;
}

export const TooltipButton = ({ children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, className, hideWhenDetached, portal = false, ...props }: TooltipButtonProps) => {
  if (disabled) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger className={className} asChild>
        {children}
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
};
