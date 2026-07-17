import { HandGrabIcon, HandIcon, MinusIcon, PlusIcon, RefreshCwIcon, RotateCwSquareIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageViewer } from '~/modules/attachment/render/image-viewer';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type RenderImageProps = {
  image: string;
  alt?: string;
  imageClassName?: string;
  showButtons?: boolean;
  onPanStateToggle?: (state: boolean) => void;
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
      <Button
        onClick={onClick}
        className={cn(
          'rounded-none border border-input bg-background text-accent-foreground hover:bg-accent',
          className,
        )}
      >
        {icon}
      </Button>
    </TooltipButton>
  );
}

export function ReactPanZoom({ image, alt, showButtons, imageClassName, onPanStateToggle }: RenderImageProps) {
  const { t } = useTranslation();
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // On by default if to onPanStateToggle passed
  const [panState, setPanState] = useState(!onPanStateToggle);

  // Image fits its container via CSS (object-contain), so zoom = 1 is the natural "fit". We don't
  // Calculate the initial scale before paint to avoid a visible jump and fit
  // cached images (whose load event never fires).
  const resetAll = () => {
    setDx(0);
    setDy(0);
    setZoom(1);
    setRotation(0);
  };

  const zoomIn = () => setZoom((prevZoom) => prevZoom + 0.2);
  const zoomOut = () => setZoom((prevZoom) => (prevZoom >= 0.4 ? prevZoom - 0.2 : prevZoom));
  const rotateRight = () => setRotation((prevRotation) => (prevRotation === 3 ? 0 : prevRotation + 1));

  const onPan = (dx: number, dy: number) => {
    setDx(dx);
    setDy(dy);
  };

  return (
    <>
      {showButtons && (
        <div className="absolute bottom-3 left-[calc(50vw-6.5rem)] z-20 flex items-center justify-center gap-0 rounded-md bg-transparent text-sm shadow-xs ring-offset-background">
          <ControlButton
            tooltipContent={t('c:zoom_in')}
            onClick={zoomIn}
            icon={<PlusIcon className="icon-sm" />}
            className="rounded-l-md border-r-0"
          />
          <ControlButton
            tooltipContent={t('c:zoom_out')}
            onClick={zoomOut}
            icon={<MinusIcon className="icon-sm" />}
            className="border-r-0"
          />
          <ControlButton
            tooltipContent={t('c:rotate_right')}
            onClick={rotateRight}
            icon={<RotateCwSquareIcon className="icon-sm" />}
            className="border-r-0"
          />

          {onPanStateToggle && (
            <ControlButton
              tooltipContent={t('c:toggle_pan_view')}
              onClick={() => {
                setPanState(!panState);
                onPanStateToggle(panState);
              }}
              icon={panState ? <HandGrabIcon className="icon-sm" /> : <HandIcon className="icon-sm" />}
              className="border-r-0"
            />
          )}

          <ControlButton
            tooltipContent={t('c:reset')}
            onClick={resetAll}
            icon={<RefreshCwIcon className="icon-sm" />}
            className="rounded-r-md"
          />
        </div>
      )}

      <ImageViewer
        className="z-10 flex h-full w-full items-center justify-center"
        zoom={zoom}
        setZoom={setZoom}
        enablePan={panState}
        pandx={dx}
        pandy={dy}
        onPan={onPan}
        rotation={rotation}
      >
        {/* Image */}
        <img
          style={{ transform: `rotate(${rotation * 90}deg)` }}
          className={cn(imageClassName, 'h-full w-full object-contain')}
          src={image}
          alt={alt}
        />
      </ImageViewer>
    </>
  );
}
