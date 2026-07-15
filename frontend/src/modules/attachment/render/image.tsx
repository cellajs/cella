import { HandGrabIcon, HandIcon, MinusIcon, PlusIcon, RefreshCwIcon, RotateCwSquareIcon } from 'lucide-react';
import type React from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { ImageViewer } from '~/modules/attachment/render/image-viewer';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type RenderImageProps = {
  image: string;
  alt?: string;
  ref?: React.Ref<HTMLImageElement>;
  customButton?: React.ReactNode;
  resetImageState?: boolean;
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

function RenderImage(
  { image, alt, resetImageState, showButtons, imageClassName, onPanStateToggle }: RenderImageProps,
  forwardedRef: React.ForwardedRef<HTMLImageElement>,
) {
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  // On by default if to onPanStateToggle passed
  const [panState, setPanState] = useState(!onPanStateToggle);

  const imgRef = useRef<HTMLImageElement>(null);

  // Image fits its container via CSS (object-contain), so zoom = 1 is the natural "fit". We don't
  // measure rendered size on load and rescale — that jumped one frame after paint, and never fit
  // cached images (whose load event never fires).
  const resetAll = () => {
    setDx(0);
    setDy(0);
    setZoom(1);
    setRotation(0);
  };

  useEffect(() => {
    if (resetImageState) resetAll();
  }, [resetImageState]);

  const zoomIn = () => setZoom((prevZoom) => prevZoom + 0.2);
  const zoomOut = () => setZoom((prevZoom) => (prevZoom >= 0.4 ? prevZoom - 0.2 : prevZoom));
  const rotateRight = () => setRotation((prevRotation) => (prevRotation === 3 ? 0 : prevRotation + 1));

  const onPan = (dx: number, dy: number) => {
    setDx(dx);
    setDy(dy);
  };

  useEffect(() => {
    if (!forwardedRef) return;
    if (typeof forwardedRef === 'function') forwardedRef(imgRef.current);
    else forwardedRef.current = imgRef.current;
  }, [forwardedRef]);

  return (
    <>
      {showButtons && (
        <div className="absolute bottom-3 left-[calc(50vw-6.5rem)] z-20 flex items-center justify-center gap-0 rounded-md bg-transparent text-sm shadow-xs ring-offset-background">
          <ControlButton
            tooltipContent="Zoom in"
            onClick={zoomIn}
            icon={<PlusIcon className="icon-sm" />}
            className="rounded-l-md border-r-0"
          />
          <ControlButton
            tooltipContent="Zoom out"
            onClick={zoomOut}
            icon={<MinusIcon className="icon-sm" />}
            className="border-r-0"
          />
          <ControlButton
            tooltipContent="Rotate right"
            onClick={rotateRight}
            icon={<RotateCwSquareIcon className="icon-sm" />}
            className="border-r-0"
          />

          {onPanStateToggle && (
            <ControlButton
              tooltipContent="Toggle pan view"
              onClick={() => {
                setPanState(!panState);
                onPanStateToggle(panState);
              }}
              icon={panState ? <HandGrabIcon className="icon-sm" /> : <HandIcon className="icon-sm" />}
              className="border-r-0"
            />
          )}

          <ControlButton
            tooltipContent="Reset"
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
          ref={imgRef}
          style={{ transform: `rotate(${rotation * 90}deg)` }}
          className={cn(imageClassName, 'h-full w-full object-contain')}
          src={image}
          alt={alt}
        />
      </ImageViewer>
    </>
  );
}

export const ReactPanZoom = forwardRef<HTMLImageElement, RenderImageProps>(RenderImage);
