import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/** Zoom 1 is the CSS fit inside the dialog stage; the floor keeps a zoomed-out image visible, the ceiling keeps it navigable. */
export const minZoom = 0.25;
export const maxZoom = 8;
const zoomStep = 0.2;
/** Per wheel pixel: a 100px mouse notch is roughly 20%, a pinch delta of a few pixels stays smooth. */
const wheelZoomSensitivity = 0.002;

const clampZoom = (zoom: number) => Math.min(maxZoom, Math.max(minZoom, zoom));

type Offset = { x: number; y: number };

const blockPageWheel = (event: Event) => event.preventDefault();

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
  const [isDragging, setIsDragging] = useState(false);
  // Pointer position, committed offset and viewport at the start of the current drag, plus its latest offset
  const dragRef = useRef<{ startX: number; startY: number; startOffset: Offset; viewport: HTMLElement; offset: Offset | null } | null>(null);
  // Removes the window mouseup listener of the current mouse drag
  const stopWindowReleaseRef = useRef<(() => void) | null>(null);
  // Pending frames: moves and wheel deltas between frames collapse into one write each
  const panFrameRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const wheelFactorRef = useRef(1);

  // Every input (buttons, wheel, trackpad pinch) goes through the same clamp.
  const setZoom = (next: number) => setZoomState(clampZoom(next));

  useEffect(
    () => () => {
      document.removeEventListener('wheel', blockPageWheel);
      stopWindowReleaseRef.current?.();
      cancelAnimationFrame(panFrameRef.current);
      cancelAnimationFrame(wheelFrameRef.current);
    },
    [],
  );

  const panEnd = () => {
    stopWindowReleaseRef.current?.();
    stopWindowReleaseRef.current = null;
    cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = 0;
    const current = dragRef.current;
    dragRef.current = null;
    // Write the last move as well, since its frame was cancelled: the DOM must match the offset committed here.
    if (current?.offset) {
      writeOffset(current.viewport, current.offset);
      setOffset(current.offset);
    }
    setIsDragging(false);
  };

  const panStart = (pageX: number, pageY: number, event: React.MouseEvent | React.TouchEvent) => {
    if (!panEnabled) return;
    dragRef.current = { startX: pageX, startY: pageY, startOffset: offset, viewport: event.currentTarget as HTMLElement, offset: null };
    setIsDragging(true);
    // A mouse button released outside the viewport ends the drag too; touch delivers touchend to its target.
    if (!('touches' in event)) {
      stopWindowReleaseRef.current?.();
      window.addEventListener('mouseup', panEnd, { once: true });
      stopWindowReleaseRef.current = () => window.removeEventListener('mouseup', panEnd);
    }
    // Keeps the drag from reaching the carousel
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    event.preventDefault();
  };

  const panMove = (pageX: number, pageY: number) => {
    const current = dragRef.current;
    if (!current) return;
    current.offset = { x: current.startOffset.x + pageX - current.startX, y: current.startOffset.y + pageY - current.startY };
    if (panFrameRef.current) return;
    panFrameRef.current = requestAnimationFrame(() => {
      panFrameRef.current = 0;
      if (dragRef.current?.offset) writeOffset(dragRef.current.viewport, dragRef.current.offset);
    });
  };

  const panProps = {
    style: { userSelect: 'none', cursor: isDragging ? 'move' : undefined, '--pan-x': offset.x, '--pan-y': offset.y } as const,
    onMouseDown: (event: React.MouseEvent) => panStart(event.pageX, event.pageY, event),
    onMouseMove: (event: React.MouseEvent) => panMove(event.pageX, event.pageY),
    onMouseUp: panEnd,
    onTouchStart: (event: React.TouchEvent) => panStart(event.touches[0].pageX, event.touches[0].pageY, event),
    onTouchMove: (event: React.TouchEvent) => panMove(event.touches[0].pageX, event.touches[0].pageY),
    onTouchEnd: panEnd,
    // A trackpad pinch arrives as a ctrlKey wheel with small deltas: the exponential step keeps pinch and mouse
    // wheel continuous, and the clamp sets the floor and ceiling. Steps multiply, so a frame's deltas apply as one.
    onWheel: (event: React.WheelEvent) => {
      const deltaY = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      wheelFactorRef.current *= Math.exp(-deltaY * wheelZoomSensitivity);
      if (wheelFrameRef.current) return;
      wheelFrameRef.current = requestAnimationFrame(() => {
        wheelFrameRef.current = 0;
        const factor = wheelFactorRef.current;
        wheelFactorRef.current = 1;
        setZoomState((prev) => clampZoom(prev * factor));
      });
    },
    // React wheel listeners are passive, so page scrolling is blocked from the document while hovering
    onMouseEnter: () => document.addEventListener('wheel', blockPageWheel, { passive: false }),
    onMouseLeave: () => document.removeEventListener('wheel', blockPageWheel),
  };

  return {
    rotation,
    /** Zoomed in, so there is something to pan to. */
    zoomed: zoom > 1,
    // The drag one step at a time, for the keyboard and for a pointer that cannot drag
    panBy: (x: number, y: number) => setOffset((prev) => ({ x: prev.x + x, y: prev.y + y })),
    panProps,
    layerStyle: { transform: `matrix(${zoom},0,0,${zoom},var(--pan-x,0),var(--pan-y,0))` },
    zoomIn: () => setZoom(zoom + zoomStep),
    zoomOut: () => setZoom(zoom - zoomStep),
    rotateRight: () => setRotation((prev) => (prev + 1) % 4),
    // The image fits its container via CSS (object-contain), so zoom 1 is the natural fit.
    reset: () => {
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    },
  };
}
