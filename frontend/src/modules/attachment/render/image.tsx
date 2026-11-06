import { MinusIcon, PlusIcon, RefreshCwIcon, RotateCwSquareIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEventListener } from '~/hooks/use-event-listener';
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
  /** Called on a tap beside the image; also sizes the image to its content, so a letterbox tap misses it. */
  onBackdropClick?: () => void;
}

/** Pixels one arrow key moves the zoomed image. */
const panStep = 120;

/** Arrow keys move the view as a scroll would: left brings the image's left side into view. */
const panKeys: Record<string, [number, number]> = {
  ArrowLeft: [panStep, 0],
  ArrowRight: [-panStep, 0],
  ArrowUp: [0, panStep],
  ArrowDown: [0, -panStep],
};

interface ControlButtonProps {
  tooltipContent: string;
  onClick: () => void;
  icon: IconComponent;
}

function ControlButton({ tooltipContent, onClick, icon: Icon }: ControlButtonProps) {
  return (
    <TooltipButton toolTipContent={tooltipContent}>
      <Button variant="outline" onClick={onClick}>
        <Icon className="size-3.5" />
      </Button>
    </TooltipButton>
  );
}

export function RenderImage({ image, alt, showButtons, imageClassName, onBackdropClick }: RenderImageProps) {
  const { t } = useTranslation();
  const { rotation, zoomed, panBy, panProps, layerStyle, zoomIn, zoomOut, rotateRight, reset } = usePanZoom(onBackdropClick);

  // Only the shown slide pans: the carousel leaves the arrow keys to a slide that holds them (data-carousel-hold below).
  useEventListener(
    'keydown',
    (event) => {
      const step = panKeys[event.key];
      if (!step) return;
      event.preventDefault();
      panBy(...step);
    },
    { enabled: zoomed && !!showButtons, capture: true },
  );

  return (
    <>
      {showButtons && (
        <ButtonGroup className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md shadow-xs max-sm:hidden">
          <ControlButton tooltipContent={t('c:zoom_in')} onClick={zoomIn} icon={PlusIcon} />
          <ControlButton tooltipContent={t('c:zoom_out')} onClick={zoomOut} icon={MinusIcon} />
          <ControlButton tooltipContent={t('c:rotate_right')} onClick={rotateRight} icon={RotateCwSquareIcon} />
          <ControlButton tooltipContent={t('c:reset')} onClick={reset} icon={RefreshCwIcon} />
        </ButtonGroup>
      )}

      <div data-carousel-hold={zoomed || undefined} className="flex size-full items-center justify-center" {...panProps}>
        <div className="flex size-full items-center justify-center" style={layerStyle}>
          <img
            style={{ transform: `rotate(${rotation * 90}deg)` }}
            className={cn('object-contain', onBackdropClick ? 'max-h-full max-w-full' : 'size-full', imageClassName)}
            src={image}
            alt={alt}
          />
        </div>
      </div>
    </>
  );
}
