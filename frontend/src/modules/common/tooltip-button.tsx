import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';
import type * as TooltipPrimitive from '@radix-ui/react-tooltip';

interface TooltipButtonProps extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  children: React.ReactNode;
  toolTipContent: string;
  disabled?: boolean;
}

export const TooltipButton = ({ children, toolTipContent, disabled, side = 'bottom', sideOffset = 8, ...props }: TooltipButtonProps) => {
  if (disabled) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} {...props} sideOffset={sideOffset}>{toolTipContent}</TooltipContent>
    </Tooltip>
  );
};
