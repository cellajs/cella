// This code is originally authored by https://github.com/mgorabbani (https://github.com/mgorabbani/react-image-pan-zoom-rotate).

import { CornerDownLeft, FlipHorizontal2, Minus, Plus, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { Button } from '~/modules/ui/button';
import PanViewer from './panwiever-setup';

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
  const [dx, setDx] = React.useState(0);
  const [dy, setDy] = React.useState(0);
  const [zoom, setZoom] = React.useState(1);
  const [rotation, setRotation] = React.useState(0);
  const [flip, setFlip] = React.useState(false);

  const resetAll = () => {
    setDx(0);
    setDy(0);
    setZoom(1);
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

  const rotateLeft = () => {
    setRotation((prevRotation) => (prevRotation === -3 ? 0 : prevRotation - 1));
  };

  const flipImage = () => {
    setFlip((prevFlip) => !prevFlip);
  };

  const onPan = (dx: number, dy: number) => {
    setDx(dx);
    setDy(dy);
  };

  return (
    <>
      {showButtons && (
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
      <PanViewer
        className="w-full h-full flex justify-center items-center z-10"
        zoom={zoom}
        setZoom={setZoom}
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
