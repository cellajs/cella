// This code is originally authored by https://github.com/mgorabbani (https://github.com/mgorabbani/react-image-pan-zoom-rotate).

<<<<<<< HEAD
import { Minus, Plus, RefreshCw, RotateCwSquare } from 'lucide-react';
import * as React from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';
import { TooltipButton } from '../tooltip-button';
=======
import { CornerDownLeft, FlipHorizontal2, Minus, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { Button } from '~/modules/ui/button';
>>>>>>> upstream/development
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
<<<<<<< HEAD
  const isDesktop = useBreakpoints('min', 'xl', true);
  const [dx, setDx] = React.useState(0);
  const [dy, setDy] = React.useState(0);
  const [zoom, setZoom] = React.useState(isDesktop ? 0.9 : 1);
=======
  const [dx, setDx] = React.useState(0);
  const [dy, setDy] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
>>>>>>> upstream/development
  const [rotation, setRotation] = React.useState(0);
  const [flip, setFlip] = React.useState(false);

  const resetAll = () => {
    setDx(0);
    setDy(0);
<<<<<<< HEAD
    setZoom(isDesktop ? 0.9 : 1);
=======
    setZoom(1);
>>>>>>> upstream/development
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

<<<<<<< HEAD
  const rotateRight = () => {
    setRotation((prevRotation) => (prevRotation === 3 ? 0 : prevRotation + 1));
  };

  // const flipImage = () => {
  //   setFlip((prevFlip) => !prevFlip);
  // };
=======
  const rotateLeft = () => {
    setRotation((prevRotation) => (prevRotation === -3 ? 0 : prevRotation - 1));
  };

  const flipImage = () => {
    setFlip((prevFlip) => !prevFlip);
  };
>>>>>>> upstream/development

  const onPan = (dx: number, dy: number) => {
    setDx(dx);
    setDy(dy);
  };

  return (
    <>
      {showButtons && (
<<<<<<< HEAD
        <ToggleGroup
          type="single"
          variant="merged"
          className="gap-0 flex left-[calc(50vw-5rem)] shadow-sm rounded-sm bottom-3 absolute z-20 select-none"
          onValueChange={(value) => {
            switch (value) {
              case 'zoomIn':
                zoomIn();
                break;
              case 'zoomOut':
                zoomOut();
                break;
              case 'rotateRight':
                rotateRight();
                break;
              case 'resetAll':
                resetAll();
                break;
              default:
                break;
            }
          }}
        >
          <TooltipButton toolTipContent="Zoom in">
            <ToggleGroupItem value="zoomIn" className="bg-background hover:bg-accent text-accent-foreground">
              <Plus size={14} />
            </ToggleGroupItem>
          </TooltipButton>

          <TooltipButton toolTipContent="Zoom out">
            <ToggleGroupItem value="zoomOut" className="bg-background hover:bg-accent text-accent-foreground">
              <Minus size={14} />
            </ToggleGroupItem>
          </TooltipButton>

          <TooltipButton toolTipContent="Rotate right">
            <ToggleGroupItem value="rotateRight" className="bg-background hover:bg-accent text-accent-foreground">
              <RotateCwSquare size={14} />
            </ToggleGroupItem>
          </TooltipButton>

          <TooltipButton toolTipContent="Reset">
            <ToggleGroupItem value="resetAll" className="bg-background hover:bg-accent text-accent-foreground">
              <RefreshCw size={14} />
            </ToggleGroupItem>
          </TooltipButton>
        </ToggleGroup>
      )}

=======
        <div className="absolute flex flex-col right-0 top-12 gap-1 z-20 select-none rounded bg-transparent">
          <Button size="icon" variant="outline" onClick={zoomIn}>
            <Plus size={20} />
          </Button>
          <Button size="icon" variant="outline" onClick={zoomOut}>
            <Minus size={20} />
          </Button>
          <Button size="icon" variant="outline" onClick={rotateLeft}>
            <CornerDownLeft size={20} />
          </Button>
          <Button size="icon" variant="outline" onClick={flipImage}>
            <FlipHorizontal2 size={20} />
          </Button>
          <Button size="icon" variant="outline" onClick={resetAll}>
            <RefreshCw size={20} />
          </Button>
        </div>
      )}
>>>>>>> upstream/development
      <PanViewer
        className="w-full h-full flex justify-center items-center z-10"
        zoom={zoom}
        setZoom={setZoom}
<<<<<<< HEAD
        enablePan={true}
=======
>>>>>>> upstream/development
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
