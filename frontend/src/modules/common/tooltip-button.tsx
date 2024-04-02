import { Tooltip, TooltipContent, TooltipTrigger } from '~/modules/ui/tooltip';

interface TooltipButtonProps {
  children: React.ReactNode;
  side?: 'bottom' | 'left' | 'right' | 'top';
  toolTipContent: string;
}

export const TooltipButton = ({ children, side = 'bottom', toolTipContent }: TooltipButtonProps) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{toolTipContent}</TooltipContent>
    </Tooltip>
  );
};
