// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGridDimensions } from './use-grid-dimensions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const gridHeight = 2000;
let gridTop = 100;
const renders: { scrollTop: number; viewportHeight: number; measured: boolean }[] = [];

function Probe() {
  const { gridRef, scrollTop, viewportHeight, measured } = useGridDimensions();
  renders.push({ scrollTop, viewportHeight, measured });
  return <div ref={gridRef} />;
}

let root: Root | undefined;

/** Moves the grid relative to the viewport, as a window scroll does, and runs the scroll listener. */
function scrollTo(top: number) {
  gridTop = top;
  act(() => window.dispatchEvent(new Event('scroll')));
}

describe('useGridDimensions with window scroll', () => {
  beforeEach(() => {
    gridTop = 100;
    renders.length = 0;
    vi.stubGlobal('ResizeObserver', class {});
    // Frames run synchronously so each scroll event measures at once.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ top: gridTop, bottom: gridTop + gridHeight, height: gridHeight, left: 0, right: 400, width: 400 }) as DOMRect,
    );
    root = createRoot(document.body.appendChild(document.createElement('div')));
    act(() => root?.render(<Probe />));
  });

  afterEach(() => {
    act(() => root?.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('commits the first measurement, then only scroll steps that move the row window', () => {
    expect(renders.at(-1)).toEqual({ scrollTop: 0, viewportHeight: window.innerHeight, measured: true });
    const measuredRenders = renders.length;

    // Scrolling while the grid is below the viewport top keeps scrollTop at 0.
    scrollTo(40);
    expect(renders.length).toBe(measuredRenders);

    scrollTo(-50);
    expect(renders.at(-1)?.scrollTop).toBe(64);
    const steppedRenders = renders.length;

    // Within the same step: no new snapshot.
    scrollTo(-60);
    scrollTo(-70);
    expect(renders.length).toBe(steppedRenders);
  });

  it('clamps to the grid height once the grid has scrolled out of view', () => {
    scrollTo(-5000);
    const clamped = renders.at(-1)?.scrollTop;
    expect(clamped).toBeGreaterThanOrEqual(gridHeight - 16);
    expect(clamped).toBeLessThanOrEqual(gridHeight + 16);
    const clampedRenders = renders.length;

    scrollTo(-6000);
    scrollTo(-9000);
    expect(renders.length).toBe(clampedRenders);
  });
});
