import { Grab, Hand, Minus, Plus, RefreshCw, RotateCwSquare } from 'lucide-react';
import * as React from 'react';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { Button } from '~/modules/ui/button';
import { TooltipButton } from '../../common/tooltip-button';
import PanViewer from './image-viewer-setup';

type ReactPanZoomProps = {
  image: string;
  alt?: string;
  ref?: React.Ref<HTMLImageElement>;
  customButton?: React.ReactNode;
  resetImageState?: boolean;
  imageClass?: string;
  showButtons?: boolean;
  togglePanState?: boolean;
};

const ReactPanZoom = React.forwardRef<HTMLImageElement, ReactPanZoomProps>(
  ({ image, alt, resetImageState, showButtons, imageClass, togglePanState = false }, forwardedRef) => {
    const [dx, setDx] = React.useState(0);
    const [dy, setDy] = React.useState(0);
    const [zoom, setZoom] = React.useState(1);
    const [rotation, setRotation] = React.useState(0);
    const [flip, setFlip] = React.useState(false);
    const [panState, setPanState] = React.useState(!togglePanState);

    const imgRef = React.useRef<HTMLImageElement>(null);

    const calculateInitialZoom = () => {
      const imageElement = imgRef.current;
      if (imageElement) {
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

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
      setFlip(false);
    };

    React.useEffect(() => {
      if (resetImageState) resetAll();
    }, [resetImageState]);

    const zoomIn = () => setZoom((prevZoom) => prevZoom + 0.2);
    const zoomOut = () => setZoom((prevZoom) => (prevZoom >= 0.4 ? prevZoom - 0.2 : prevZoom));
    const rotateRight = () => setRotation((prevRotation) => (prevRotation === 3 ? 0 : prevRotation + 1));
    // const flipImage = () => setFlip((prevFlip) => !prevFlip)};

    const onPan = (dx: number, dy: number) => {
      setDx(dx);
      setDy(dy);
    };

    // Calculate zoom based on the rendered image size
    React.useEffect(() => {
      const imageElement = imgRef.current;
      imageElement?.addEventListener('load', calculateInitialZoom); // Wait for image load if not
      return () => imageElement?.removeEventListener('load', calculateInitialZoom);
    }, [image]);

    // Use the forwarded ref (combine imgRef with the passed ref if available)
    React.useEffect(() => {
      if (!forwardedRef) return;
      // Call function ref if passed
      if (typeof forwardedRef === 'function') forwardedRef(imgRef.current);
      else (forwardedRef as React.MutableRefObject<HTMLImageElement | null>).current = imgRef.current;
    }, [forwardedRef]);

    return (
      <>
        {showButtons && (
          <div className="absolute z-20 flex items-center justify-center left-[calc(50vw-5rem)] bottom-3 gap-0 rounded-md text-sm shadow-sm bg-transparent ring-offset-background">
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

            {togglePanState !== undefined && (
              <TooltipButton toolTipContent="Toggle pan view">
                <Button
                  onClick={() => {
                    setPanState(!panState);
                    dispatchCustomEvent('toggleCarouselDrag', panState);
                  }}
                  className="bg-background border border-input rounded-none hover:bg-accent text-accent-foreground"
                >
                  {panState ? <Grab size={14} /> : <Hand size={14} />}
                </Button>
              </TooltipButton>
            )}

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
          enablePan={panState}
          pandx={dx}
          pandy={dy}
          onPan={onPan}
          rotation={rotation}
          key={dx}
        >
          <img
            ref={imgRef}
            style={{
              transform: `rotate(${rotation * 90}deg) scaleX(${flip ? -1 : 1})`,
              width: '100%',
            }}
            className={imageClass}
            src={image}
            alt={alt}
          />
        </PanViewer>
      </>
    );
  },
);

export default ReactPanZoom;
