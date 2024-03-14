import {start_cells, set_cell_color, stop_cells} from './animation.js';
import { useEffect } from 'react';

function maximize_canvas(c: HTMLCanvasElement) {
  if (!c) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  c.width = width;
  c.height = height;
}

const BgAnimation = () => {

  useEffect(() => {
    const c = document.getElementById('animation-canvas') as HTMLCanvasElement;

    start_cells(c);
    set_cell_color([0.9, 0.2, 0.2]);

    maximize_canvas(c);
    
    return () => {
      stop_cells();
    };
  });

  return <canvas id="animation-canvas" className="absolute z-[-1] w-full h-full opacity-50" />;
};

export default BgAnimation;
