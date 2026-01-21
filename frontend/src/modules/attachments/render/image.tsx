import { GrabIcon, HandIcon, MinusIcon, PlusIcon, RefreshCwIcon, RotateCwSquareIcon } from 'lucide-react';
import type React from 'react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import ImageViewer from '~/modules/attachments/render/image-viewer';
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
        className={cn('bg-background border border-input rounded-none hover:bg-accent text-accent-foreground', className)}
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

  const calculateInitialZoom = () => {
    const imageElement = imgRef.current;
    if (imageElement) {
      const windowWidth = window.innerWidth - 40;
      const windowHeight = window.innerHeight - 100;

      const renderedWidth = imageElement.offsetWidth;
      const renderedHeight = imageElement.offsetHeight;

      const scaleX = windowWidth / renderedWidth;
      const scaleY = windowHeight / renderedHeight;

      setZoom(Math.min(scaleX, scaleY)); // Set zoom based on rendered size
    }
  };

  const resetAll = () => {
    setDx(0);
    setDy(0);
    calculateInitialZoom();
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
    const imageElement = imgRef.current;
    imageElement?.addEventListener('load', calculateInitialZoom); // Wait for image load if not
    return () => imageElement?.removeEventListener('load', calculateInitialZoom);
  }, [image]);

  useEffect(() => {
    if (!forwardedRef) return;
    if (typeof forwardedRef === 'function') forwardedRef(imgRef.current);
    else forwardedRef.current = imgRef.current;
  }, [forwardedRef]);

  return (
    <>
      {showButtons && (
        <div className="absolute z-20 flex items-center justify-center left-[calc(50vw-6.5rem)] bottom-3 gap-0 rounded-md text-sm shadow-xs bg-transparent ring-offset-background">
          <ControlButton
            tooltipContent="Zoom in"
            onClick={zoomIn}
            icon={<PlusIcon size={14} />}
            className="rounded-l-md border-r-0 "
          />
          <ControlButton
            tooltipContent="Zoom out"
            onClick={zoomOut}
            icon={<MinusIcon size={14} />}
            className="border-r-0 "
          />
          <ControlButton
            tooltipContent="Rotate right"
            onClick={rotateRight}
            icon={<RotateCwSquareIcon size={14} />}
            className="border-r-0 "
          />

          {onPanStateToggle && (
            <ControlButton
              tooltipContent="Toggle pan view"
              onClick={() => {
                setPanState(!panState);
                onPanStateToggle(panState);
              }}
              icon={panState ? <GrabIcon size={14} /> : <HandIcon size={14} />}
              className="border-r-0 "
            />
          )}

          <ControlButton
            tooltipContent="Reset"
            onClick={resetAll}
            icon={<RefreshCwIcon size={14} />}
            className="rounded-r-md "
          />
        </div>
      )}

      <ImageViewer
        className="w-full h-full flex justify-center items-center z-10"
        zoom={zoom}
        setZoom={setZoom}
        enablePan={panState}
        pandx={dx}
        pandy={dy}
        onPan={onPan}
        rotation={rotation}
        key={dx}
      >
        {/* Image */}
        <img
          ref={imgRef}
          style={{ transform: `rotate(${rotation * 90}deg)`, width: '100%' }}
          className={imageClassName}
          src={image}
          alt={alt}
        />
      </ImageViewer>
    </>
  );
}

export default forwardRef<HTMLImageElement, RenderImageProps>(RenderImage);
