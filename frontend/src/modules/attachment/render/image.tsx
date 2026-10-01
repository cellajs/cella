import { HandGrabIcon, HandIcon, MinusIcon, PlusIcon, RefreshCwIcon, RotateCwSquareIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePanZoom } from '~/modules/attachment/render/use-pan-zoom';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type RenderImageProps = {
  image: string;
  alt?: string;
  imageClassName?: string;
  showButtons?: boolean;
  onPanStateToggle?: (state: boolean) => void;
  /** Dialog viewer: sizes the image to its content so the letterbox falls through to the backdrop, while panning on the image still works. */
  backdropDismiss?: boolean;
};

interface ControlButtonProps {
  tooltipContent: string;
  onClick: () => void;
  icon: React.ReactNode;
  className: string;
}
function ControlButton({ tooltipContent, onClick, icon, className }: ControlButtonProps) {
  return (
    <TooltipButton toolTipContent={tooltipContent}>
      <Button onClick={onClick} className={cn('rounded-none border border-input bg-background text-accent-foreground hover:bg-accent', className)}>
        {icon}
      </Button>
    </TooltipButton>
  );
}

export function ReactPanZoom({ image, alt, showButtons, imageClassName, onPanStateToggle, backdropDismiss = false }: RenderImageProps) {
  const { t } = useTranslation();
  // On by default when no onPanStateToggle is passed.
  const [panState, setPanState] = useState(!onPanStateToggle);
  const { rotation, panProps, layerStyle, zoomIn, zoomOut, rotateRight, reset } = usePanZoom(panState);

  return (
    <>
      {showButtons && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center gap-0 rounded-md bg-transparent text-sm shadow-xs ring-offset-background">
          <ControlButton
            tooltipContent={t('c:zoom_in')}
            onClick={zoomIn}
            icon={<PlusIcon className="size-3.5" />}
            className="rounded-l-md border-r-0"
          />
          <ControlButton tooltipContent={t('c:zoom_out')} onClick={zoomOut} icon={<MinusIcon className="size-3.5" />} className="border-r-0" />
          <ControlButton
            tooltipContent={t('c:rotate_right')}
            onClick={rotateRight}
            icon={<RotateCwSquareIcon className="size-3.5" />}
            className="border-r-0"
          />

          {onPanStateToggle && (
            <ControlButton
              tooltipContent={t('c:toggle_pan_view')}
              onClick={() => {
                setPanState(!panState);
                onPanStateToggle(panState);
              }}
              icon={panState ? <HandGrabIcon className="size-3.5" /> : <HandIcon className="size-3.5" />}
              className="border-r-0"
            />
          )}

          <ControlButton tooltipContent={t('c:reset')} onClick={reset} icon={<RefreshCwIcon className="size-3.5" />} className="rounded-r-md" />
        </div>
      )}

      <div className={cn('flex size-full items-center justify-center', backdropDismiss && 'pointer-events-none')} {...panProps}>
        <div className="flex size-full items-center justify-center" style={layerStyle}>
          <img
            style={{ transform: `rotate(${rotation * 90}deg)` }}
            className={cn('object-contain', backdropDismiss ? 'pointer-events-auto max-h-full max-w-full' : 'size-full', imageClassName)}
            src={image}
            alt={alt}
          />
        </div>
      </div>
    </>
  );
}
