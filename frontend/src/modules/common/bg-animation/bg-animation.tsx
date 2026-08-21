import { useEffect } from 'react';
import { useMountedState } from '~/hooks/use-mounted-state';
import { set_cell_color, start_cells, stop_cells } from '~/modules/common/bg-animation/animation.js';
import { useUIStore } from '~/modules/ui/ui-store';

function maximize_canvas(c: HTMLCanvasElement) {
  if (!c) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  c.width = width;
  c.height = height;
}

/** Full-viewport background art that positions and fades itself in; mount it lazily with a `null` Suspense fallback. */
export function BgAnimation() {
  const { theme } = useUIStore();
  const { hasWaited } = useMountedState();

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

  return (
    <div
      data-waited={hasWaited}
      className="fixed top-0 left-0 h-full w-full transition-opacity delay-1000 duration-1000 data-[waited=false]:opacity-0 data-[waited=true]:opacity-100"
    >
      <canvas id="animation-canvas" className="absolute z-[-1] h-full w-full opacity-30" />
    </div>
  );
}
