import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  HandGrabIcon,
  HandIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCwSquareIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePanZoom } from '~/modules/attachment/render/use-pan-zoom';
import type { IconComponent } from '~/modules/common/icons/types';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { ButtonGroup } from '~/modules/ui/button-group';
import { cn } from '~/utils/cn';

interface RenderImageProps {
  image: string;
  alt?: string;
  imageClassName?: string;
  showButtons?: boolean;
  onPanModeChange?: (panning: boolean) => void;
  /** Dialog viewer: sizes the image to its content so the letterbox falls through to the backdrop, while panning on the image still works. */
  backdropDismiss?: boolean;
}

/** Pixels one press of a pan button moves the zoomed image. */
const panStep = 120;

interface ControlButtonProps {
  tooltipContent: string;
  onClick: () => void;
  icon: IconComponent;
}
function ControlButton({ tooltipContent, onClick, icon: Icon }: ControlButtonProps) {
  return (
    <TooltipButton toolTipContent={tooltipContent}>
      <Button onClick={onClick} className="border border-input bg-background text-accent-foreground hover:bg-accent">
        <Icon className="size-3.5" />
      </Button>
    </TooltipButton>
  );
}

export function RenderImage({ image, alt, showButtons, imageClassName, onPanModeChange, backdropDismiss = false }: RenderImageProps) {
  const { t } = useTranslation();
  // On by default when no onPanModeChange is passed.
  const [panEnabled, setPanEnabled] = useState(!onPanModeChange);
  const { rotation, zoomed, panBy, panProps, layerStyle, zoomIn, zoomOut, rotateRight, reset } = usePanZoom(panEnabled);

  return (
    <>
      {showButtons && (
        <ButtonGroup className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md shadow-xs">
          <ControlButton tooltipContent={t('c:zoom_in')} onClick={zoomIn} icon={PlusIcon} />
          <ControlButton tooltipContent={t('c:zoom_out')} onClick={zoomOut} icon={MinusIcon} />
          <ControlButton tooltipContent={t('c:rotate_right')} onClick={rotateRight} icon={RotateCwSquareIcon} />

          {onPanModeChange && (
            <ControlButton
              tooltipContent={t('c:toggle_pan_view')}
              onClick={() => {
                setPanEnabled(!panEnabled);
                onPanModeChange(!panEnabled);
              }}
              icon={panEnabled ? HandGrabIcon : HandIcon}
            />
          )}

          {zoomed && (
            <>
              <ControlButton tooltipContent={t('c:move_left')} onClick={() => panBy(-panStep, 0)} icon={ArrowLeftIcon} />
              <ControlButton tooltipContent={t('c:move_up')} onClick={() => panBy(0, -panStep)} icon={ArrowUpIcon} />
              <ControlButton tooltipContent={t('c:move_down')} onClick={() => panBy(0, panStep)} icon={ArrowDownIcon} />
              <ControlButton tooltipContent={t('c:move_right')} onClick={() => panBy(panStep, 0)} icon={ArrowRightIcon} />
            </>
          )}

          <ControlButton tooltipContent={t('c:reset')} onClick={reset} icon={RefreshCwIcon} />
        </ButtonGroup>
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
