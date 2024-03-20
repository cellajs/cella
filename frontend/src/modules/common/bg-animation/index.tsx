import { useEffect } from 'react';
import { useThemeStore } from '~/store/theme.js';
import { set_cell_color, start_cells, stop_cells } from './animation.js';

function maximize_canvas(c: HTMLCanvasElement) {
  if (!c) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  c.width = width;
  c.height = height;
}

const BgAnimation = () => {
  const { theme, mode } = useThemeStore();

  useEffect(() => {
    const c = document.getElementById('animation-canvas') as HTMLCanvasElement;
    if (!c) return;

    start_cells(c);
    set_cell_color(theme === 'none' ? [0.3, 0.3, 0.3] : [0.9, 0.2, 0.2]);
    maximize_canvas(c);

    return () => {
      stop_cells();
    };
  }, [document]);

  const className = `absolute z-[-1] w-full h-full ${mode === 'light' ? 'opacity-30' : 'opacity-50'}`;

  return <canvas id="animation-canvas" className={className} />;
};

export default BgAnimation;
