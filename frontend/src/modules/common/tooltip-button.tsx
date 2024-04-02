import { Tooltip, TooltipTrigger, TooltipContent } from "~/modules/ui/tooltip";

interface TooltipButtonProps {
  children: React.ReactNode;
  side?: "bottom" | "left" | "right" | "top";
  toolTipContent: string;
}

export const TooltipButton = ({
  children,
  side = "bottom",
  toolTipContent,
}: TooltipButtonProps) => {
  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipContent side={side}>{toolTipContent}</TooltipContent>
    </Tooltip>
  );
};
