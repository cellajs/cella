import { type MouseEvent, type TouchEvent, useEffect, useRef, useState, type WheelEvent } from 'react';

/** Zoom 1 is the CSS fit inside the dialog stage; the floor keeps a zoomed-out image visible, the ceiling keeps it navigable. */
export const minZoom = 0.25;
export const maxZoom = 8;
const zoomStep = 0.2;
/** Per wheel pixel: a 100px mouse notch is roughly 20%, a pinch delta of a few pixels stays smooth. */
const wheelZoomSensitivity = 0.002;
/** Pointer travel in pixels under which a press counts as a click, not a drag. */
const clickSlop = 4;

const clampZoom = (zoom: number) => Math.min(maxZoom, Math.max(minZoom, zoom));

type Offset = { x: number; y: number };
type View = { zoom: number; offset: Offset };

const centred: Offset = { x: 0, y: 0 };
const fit: View = { zoom: 1, offset: centred };

/**
 * The view at a new zoom, holding the point `anchor` (pixels from the viewport centre) in place on screen.
 * At fit or below there is nothing to pan to, so the image returns to the centre.
 */
function zoomAt({ zoom, offset }: View, nextZoom: number, anchor: Offset = centred): View {
  const next = clampZoom(nextZoom);
  if (next <= 1) return { zoom: next, offset: centred };
  const scale = next / zoom;
  return { zoom: next, offset: { x: anchor.x + (offset.x - anchor.x) * scale, y: anchor.y + (offset.y - anchor.y) * scale } };
}

const blockPageWheel = (event: Event) => event.preventDefault();

/** The viewport carries the offset as custom properties that `layerStyle` reads, so a drag moves the layer without a render. */
function writeOffset(viewport: HTMLElement, { x, y }: Offset) {
  viewport.style.setProperty('--pan-x', `${x}`);
  viewport.style.setProperty('--pan-y', `${y}`);
}

/**
 * Zoom, pan and rotation of the dialog image viewer. Spread `panProps` on the viewport and put `layerStyle` on
 * the layer inside it that holds the image. The buttons zoom around the centre, the wheel and a pinch around the
 * pointer. Zoomed in, a drag pans and a click brings the clicked point to the centre; back at fit or below, the
 * image returns to the centre.
 */
export function usePanZoom() {
  const [view, setView] = useState<View>(fit);
  const { zoom, offset } = view;
  const zoomed = zoom > 1;
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Pointer position, committed offset and viewport at the start of the current drag, plus its latest offset
  const dragRef = useRef<{ startX: number; startY: number; startOffset: Offset; viewport: HTMLElement; offset: Offset | null } | null>(null);
  // Removes the window mouseup listener of the current mouse drag
  const stopWindowReleaseRef = useRef<(() => void) | null>(null);
  // Pending frames: moves and wheel deltas between frames collapse into one write each, the wheel's at its last pointer position
  const panFrameRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const wheelFactorRef = useRef(1);
  const wheelAnchorRef = useRef<Offset>(centred);

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
    setIsDragging(false);
    if (!current) return;
    const { startX, startY, startOffset, viewport, offset: dragged } = current;

    if (!dragged || Math.hypot(dragged.x - startOffset.x, dragged.y - startOffset.y) < clickSlop) {
      // A click moves the clicked point to the centre: panning that needs no drag
      const rect = viewport.getBoundingClientRect();
      const centre = { x: startOffset.x + rect.left + rect.width / 2 - startX, y: startOffset.y + rect.top + rect.height / 2 - startY };
      setView((prev) => ({ ...prev, offset: centre }));
      return;
    }
    // Write the last move as well, since its frame was cancelled: the DOM must match the offset committed here.
    writeOffset(viewport, dragged);
    setView((prev) => ({ ...prev, offset: dragged }));
  };

  const panStart = (clientX: number, clientY: number, event: MouseEvent<HTMLElement> | TouchEvent<HTMLElement>) => {
    if (!zoomed) return;
    dragRef.current = { startX: clientX, startY: clientY, startOffset: offset, viewport: event.currentTarget, offset: null };
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

  const panMove = (clientX: number, clientY: number) => {
    const current = dragRef.current;
    if (!current) return;
    current.offset = { x: current.startOffset.x + clientX - current.startX, y: current.startOffset.y + clientY - current.startY };
    if (panFrameRef.current) return;
    panFrameRef.current = requestAnimationFrame(() => {
      panFrameRef.current = 0;
      if (dragRef.current?.offset) writeOffset(dragRef.current.viewport, dragRef.current.offset);
    });
  };

  const panProps = {
    style: {
      userSelect: 'none',
      cursor: zoomed ? (isDragging ? 'grabbing' : 'grab') : undefined,
      '--pan-x': offset.x,
      '--pan-y': offset.y,
    } as const,
    onMouseDown: (event: MouseEvent<HTMLElement>) => panStart(event.clientX, event.clientY, event),
    onMouseMove: (event: MouseEvent) => panMove(event.clientX, event.clientY),
    onMouseUp: panEnd,
    onTouchStart: (event: TouchEvent<HTMLElement>) => panStart(event.touches[0].clientX, event.touches[0].clientY, event),
    onTouchMove: (event: TouchEvent) => panMove(event.touches[0].clientX, event.touches[0].clientY),
    onTouchEnd: panEnd,
    // A trackpad pinch is a ctrlKey wheel with small deltas; one exponential scale serves it and the mouse wheel, multiplied per frame.
    onWheel: (event: WheelEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      wheelAnchorRef.current = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) };
      const deltaY = event.deltaMode === event.nativeEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      wheelFactorRef.current *= Math.exp(-deltaY * wheelZoomSensitivity);
      if (wheelFrameRef.current) return;
      wheelFrameRef.current = requestAnimationFrame(() => {
        wheelFrameRef.current = 0;
        const factor = wheelFactorRef.current;
        const anchor = wheelAnchorRef.current;
        wheelFactorRef.current = 1;
        setView((prev) => zoomAt(prev, prev.zoom * factor, anchor));
      });
    },
    // React wheel listeners are passive, so page scrolling is blocked from the document while hovering
    onMouseEnter: () => document.addEventListener('wheel', blockPageWheel, { passive: false }),
    onMouseLeave: () => document.removeEventListener('wheel', blockPageWheel),
  };

  return {
    rotation,
    /** Zoomed in, so there is something to pan to. */
    zoomed,
    // The drag one step at a time, for the arrow keys
    panBy: (x: number, y: number) => setView((prev) => ({ ...prev, offset: { x: prev.offset.x + x, y: prev.offset.y + y } })),
    panProps,
    layerStyle: { transform: `matrix(${zoom},0,0,${zoom},var(--pan-x,0),var(--pan-y,0))` },
    zoomIn: () => setView((prev) => zoomAt(prev, prev.zoom + zoomStep)),
    zoomOut: () => setView((prev) => zoomAt(prev, prev.zoom - zoomStep)),
    rotateRight: () => setRotation((prev) => (prev + 1) % 4),
    reset: () => {
      setView(fit);
      setRotation(0);
    },
  };
}
