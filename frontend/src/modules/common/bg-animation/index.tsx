import { useEffect } from 'react';
import { set_cell_color, start_cells, stop_cells } from '~/modules/common/bg-animation/animation.js';
import { useThemeStore } from '~/store/theme.js';

function maximize_canvas(c: HTMLCanvasElement) {
  if (!c) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  c.width = width;
  c.height = height;
}

const BgAnimation = () => {
  const { theme } = useThemeStore();

  useEffect(() => {
    const c = document.getElementById('animation-canvas') as HTMLCanvasElement | null;
    if (!c) return;

    start_cells(c);
    set_cell_color(theme === 'none' ? [0.3, 0.3, 0.3] : [0.9, 0.2, 0.2]);
    maximize_canvas(c);

    return () => {
      stop_cells();
    };
  }, [document]);

  return <canvas id="animation-canvas" className="absolute z-[-1] w-full h-full opacity-30" />;
};

export default BgAnimation;
