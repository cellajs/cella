// This code is originally authored by https://github.com/mgorabbani (https://github.com/mgorabbani/react-image-pan-zoom-rotate).

import { Minus, Plus, RefreshCw, RotateCwSquare } from 'lucide-react';
import * as React from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';

import { Button } from '~/modules/ui/button';
import { TooltipButton } from '../tooltip-button';
import PanViewer from './image-viewer-setup';

type ReactPanZoomProps = {
  image: string;
  alt?: string;
  // biome-ignore lint/suspicious/noExplicitAny: by author
  ref?: any;
  resetImageState?: boolean;
  imageClass?: string;
  showButtons?: boolean;
};

const ReactPanZoom = React.forwardRef<HTMLImageElement, ReactPanZoomProps>(({ image, alt, resetImageState, showButtons, imageClass }, ref) => {
  const isDesktop = useBreakpoints('min', 'xl', true);
  const [dx, setDx] = React.useState(0);
  const [dy, setDy] = React.useState(0);
  const [zoom, setZoom] = React.useState(isDesktop ? 0.9 : 1);
  const [rotation, setRotation] = React.useState(0);
  const [flip, setFlip] = React.useState(false);

  const resetAll = () => {
    setDx(0);
    setDy(0);
    setZoom(isDesktop ? 0.9 : 1);
    setRotation(0);
    setFlip(false);
  };

  React.useEffect(() => {
    if (resetImageState) {
      resetAll();
    }
  }, [resetImageState]); // Run when resetImageState changes

  const zoomIn = () => {
    setZoom((prevZoom) => prevZoom + 0.2);
  };

  const zoomOut = () => {
    setZoom((prevZoom) => (prevZoom >= 1 ? prevZoom - 0.2 : prevZoom));
  };

  const rotateRight = () => {
    setRotation((prevRotation) => (prevRotation === 3 ? 0 : prevRotation + 1));
  };

  // const flipImage = () => {
  //   setFlip((prevFlip) => !prevFlip);
  // };

  const onPan = (dx: number, dy: number) => {
    setDx(dx);
    setDy(dy);
  };

  return (
    <>
      {showButtons && (
        <div className="absolute z-20 flex items-center justify-center inline-flex left-[calc(50vw-5rem)] bottom-3 gap-0 rounded-md text-sm shadow-sm bg-transparent ring-offset-background">
          <TooltipButton toolTipContent="Zoom in">
            <Button onClick={zoomIn} className="bg-background border border-input rounded-r-none hover:bg-accent text-accent-foreground">
              <Plus size={14} />
            </Button>
          </TooltipButton>

          <TooltipButton toolTipContent="Zoom out">
            <Button onClick={zoomOut} className="bg-background border border-input rounded-none hover:bg-accent text-accent-foreground">
              <Minus size={14} />
            </Button>
          </TooltipButton>

          <TooltipButton toolTipContent="Rotate right">
            <Button onClick={rotateRight} className="bg-background border border-input rounded-none hover:bg-accent text-accent-foreground">
              <RotateCwSquare size={14} />
            </Button>
          </TooltipButton>

          <TooltipButton toolTipContent="Reset">
            <Button onClick={resetAll} className="bg-background border border-input rounded-l-none hover:bg-accent text-accent-foreground">
              <RefreshCw size={14} />
            </Button>
          </TooltipButton>
        </div>
      )}

      <PanViewer
        className="w-full h-full flex justify-center items-center z-10"
        zoom={zoom}
        setZoom={setZoom}
        enablePan={true}
        pandx={dx}
        pandy={dy}
        onPan={onPan}
        rotation={rotation}
        key={dx}
      >
        <img
          style={{
            transform: `rotate(${rotation * 90}deg) scaleX(${flip ? -1 : 1})`,
            width: '100%',
          }}
          className={imageClass}
          src={image}
          alt={alt}
          ref={ref}
        />
      </PanViewer>
    </>
  );
});

ReactPanZoom.displayName = 'ReactPanZoom'; // Set display name for better debugging

export { PanViewer };
export default ReactPanZoom;
