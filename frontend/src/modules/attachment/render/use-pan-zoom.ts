import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { clampZoom, WHEEL_ZOOM_SENSITIVITY, ZOOM_STEP } from '~/modules/attachment/render/image-zoom';

type Offset = { x: number; y: number };

const blockPageWheel = (e: Event) => e.preventDefault();

/** The viewport carries the offset as custom properties that `layerStyle` reads, so a drag moves the layer without a render. */
const writeOffset = (viewport: HTMLElement, { x, y }: Offset) => {
  viewport.style.setProperty('--pan-x', `${x}`);
  viewport.style.setProperty('--pan-y', `${y}`);
};

/**
 * Zoom, pan and rotation of the dialog image viewer. Spread `panProps` on the viewport and put `layerStyle` on
 * the layer inside it that holds the image. Zoom is anchored at the centre; a drag pans only while `panEnabled`.
 */
export function usePanZoom(panEnabled: boolean) {
  const [zoom, setZoomState] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  // Pointer position, committed offset and viewport at the start of the current drag, plus its latest offset
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; viewport: HTMLElement; offset: Offset | null } | null>(null);
  // Removes the window mouseup listener of the current mouse drag
  const stopWindowRelease = useRef<(() => void) | null>(null);
  // Pending frames: moves and wheel deltas between frames collapse into one write each
  const panFrame = useRef(0);
  const wheelFrame = useRef(0);
  const wheelFactor = useRef(1);

  // Every input (buttons, wheel, trackpad pinch) goes through the same clamp.
  const setZoom = (next: number) => setZoomState(clampZoom(next));

  useEffect(
    () => () => {
      document.removeEventListener('wheel', blockPageWheel);
      stopWindowRelease.current?.();
      cancelAnimationFrame(panFrame.current);
      cancelAnimationFrame(wheelFrame.current);
    },
    [],
  );

  const panEnd = () => {
    stopWindowRelease.current?.();
    stopWindowRelease.current = null;
    cancelAnimationFrame(panFrame.current);
    panFrame.current = 0;
    const current = drag.current;
    drag.current = null;
    // Write the last move as well, since its frame was cancelled: the DOM must match the offset committed here.
    if (current?.offset) {
      writeOffset(current.viewport, current.offset);
      setOffset(current.offset);
    }
    setIsPanning(false);
  };

  const panStart = (pageX: number, pageY: number, e: React.MouseEvent | React.TouchEvent) => {
    if (!panEnabled) return;
    drag.current = { x: pageX, y: pageY, dx: offset.x, dy: offset.y, viewport: e.currentTarget as HTMLElement, offset: null };
    setIsPanning(true);
    // A mouse button released outside the viewport ends the drag too; touch delivers touchend to its target.
    if (!('touches' in e)) {
      stopWindowRelease.current?.();
      window.addEventListener('mouseup', panEnd, { once: true });
      stopWindowRelease.current = () => window.removeEventListener('mouseup', panEnd);
    }
    // Keeps the drag from reaching the carousel
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    e.preventDefault();
  };

  const panMove = (pageX: number, pageY: number) => {
    const current = drag.current;
    if (!current) return;
    current.offset = { x: current.dx + pageX - current.x, y: current.dy + pageY - current.y };
    if (panFrame.current) return;
    panFrame.current = requestAnimationFrame(() => {
      panFrame.current = 0;
      if (drag.current?.offset) writeOffset(drag.current.viewport, drag.current.offset);
    });
  };

  const panProps = {
    style: { userSelect: 'none', cursor: isPanning ? 'move' : undefined, '--pan-x': offset.x, '--pan-y': offset.y } as const,
    onMouseDown: (e: React.MouseEvent) => panStart(e.pageX, e.pageY, e),
    onMouseMove: (e: React.MouseEvent) => panMove(e.pageX, e.pageY),
    onMouseUp: panEnd,
    onTouchStart: (e: React.TouchEvent) => panStart(e.touches[0].pageX, e.touches[0].pageY, e),
    onTouchMove: (e: React.TouchEvent) => panMove(e.touches[0].pageX, e.touches[0].pageY),
    onTouchEnd: panEnd,
    // A trackpad pinch arrives as a ctrlKey wheel with small deltas: the exponential step keeps pinch and mouse
    // wheel continuous, and the clamp sets the floor and ceiling. Steps multiply, so a frame's deltas apply as one.
    onWheel: (e: React.WheelEvent) => {
      const deltaY = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      wheelFactor.current *= Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
      if (wheelFrame.current) return;
      wheelFrame.current = requestAnimationFrame(() => {
        wheelFrame.current = 0;
        const factor = wheelFactor.current;
        wheelFactor.current = 1;
        setZoomState((prev) => clampZoom(prev * factor));
      });
    },
    // React wheel listeners are passive, so page scrolling is blocked from the document while hovering
    onMouseEnter: () => document.addEventListener('wheel', blockPageWheel, { passive: false }),
    onMouseLeave: () => document.removeEventListener('wheel', blockPageWheel),
  };

  return {
    rotation,
    panProps,
    layerStyle: { transform: `matrix(${zoom},0,0,${zoom},var(--pan-x,0),var(--pan-y,0))` },
    zoomIn: () => setZoom(zoom + ZOOM_STEP),
    zoomOut: () => setZoom(zoom - ZOOM_STEP),
    rotateRight: () => setRotation((prev) => (prev + 1) % 4),
    // The image fits its container via CSS (object-contain), so zoom 1 is the natural fit.
    reset: () => {
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    },
  };
}
