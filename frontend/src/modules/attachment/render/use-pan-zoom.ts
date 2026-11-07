import { type MouseEvent, type PointerEvent, useEffect, useRef, useState, type WheelEvent } from 'react';

/** Zoom 1 is the CSS fit inside the dialog stage; the floor keeps a zoomed-out image visible, the ceiling keeps it navigable. */
export const minZoom = 0.25;
export const maxZoom = 8;
const zoomStep = 0.2;
/** A double tap or double click toggles between fit and this zoom. */
const doubleTapZoom = 2.5;
/** Most milliseconds and pixels between the two taps of a double tap. */
const doubleTapMs = 300;
const doubleTapSlop = 24;
/** Per wheel pixel: a 100px mouse notch is roughly 20%, a pinch delta of a few pixels stays smooth. */
const wheelZoomSensitivity = 0.002;
/** Pointer travel in pixels under which a press counts as a tap: a fingertip wobbles more than a mouse. */
const tapSlop = 10;

const clampZoom = (zoom: number) => Math.min(maxZoom, Math.max(minZoom, zoom));

type Offset = { x: number; y: number };
type View = { zoom: number; offset: Offset };

/** The view and the pointers' client midpoint and spread when a pointer last went down or up, plus the latest view. */
type Gesture = { viewport: HTMLElement; startView: View; start: Offset; spread: number; view: View };

const centred: Offset = { x: 0, y: 0 };
const fit: View = { zoom: 1, offset: centred };

/** The viewport carries the view as custom properties, so a gesture moves the layer without a render. */
const layerStyle = { transform: 'matrix(var(--zoom),0,0,var(--zoom),var(--pan-x),var(--pan-y))' };

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

/** A client point in pixels from the viewport's centre, the frame `zoomAt` anchors in. */
function fromCentre(viewport: Element, { x, y }: Offset): Offset {
  const rect = viewport.getBoundingClientRect();
  return { x: x - (rect.left + rect.width / 2), y: y - (rect.top + rect.height / 2) };
}

/** Midpoint and spread of the pressed pointers: one pointer is its own midpoint, with no spread. */
function measure(pointers: Map<number, Offset>) {
  const [a = centred, b = a] = pointers.values();
  return { mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.hypot(b.x - a.x, b.y - a.y) };
}

function writeView(viewport: HTMLElement, { zoom, offset }: View) {
  viewport.style.setProperty('--zoom', `${zoom}`);
  viewport.style.setProperty('--pan-x', `${offset.x}`);
  viewport.style.setProperty('--pan-y', `${offset.y}`);
}

const blockPageWheel = (event: Event) => event.preventDefault();

/**
 * Zoom, pan and rotation of the dialog image viewer. Spread `panProps` on the viewport and put `layerStyle` on
 * the layer inside it that holds the image. The buttons zoom around the centre; the wheel, a pinch and a double
 * tap around the pointer. Zoomed in, a drag pans and a mouse click brings the clicked point to the centre; back
 * at fit or below, the image returns to the centre. A tap beside the image calls `onBackdropClick`.
 */
export function usePanZoom(onBackdropClick?: () => void) {
  const [view, setView] = useState<View>(fit);
  const { zoom, offset } = view;
  const zoomed = zoom > 1;
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Client positions of up to two pressed pointers, and the gesture they make
  const pointersRef = useRef(new Map<number, Offset>());
  const gestureRef = useRef<Gesture | null>(null);
  // Whether the current press moved or pinched, so its click is no tap, and whether a mouse made it
  const pressRef = useRef({ moved: false, mouse: false });
  const lastTapRef = useRef<{ time: number; point: Offset } | null>(null);
  // Pending frames: moves and wheel deltas between frames collapse into one write each, the wheel's at its last pointer position
  const gestureFrameRef = useRef(0);
  const wheelFrameRef = useRef(0);
  const wheelFactorRef = useRef(1);
  const wheelAnchorRef = useRef<Offset>(centred);

  useEffect(
    () => () => {
      cancelAnimationFrame(gestureFrameRef.current);
      cancelAnimationFrame(wheelFrameRef.current);
    },
    [],
  );

  // A pointer going down or up restarts the gesture from the latest view, so a pinch hands over to a drag and back
  const restartGesture = (viewport: HTMLElement) => {
    const { mid, spread } = measure(pointersRef.current);
    const latest = gestureRef.current?.view ?? view;
    gestureRef.current = { viewport, startView: latest, start: mid, spread, view: latest };
  };

  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    const pointers = pointersRef.current;
    if (pointers.size === 2 || event.button !== 0) return;
    if (pointers.size) pressRef.current.moved = true;
    else pressRef.current = { moved: false, mouse: event.pointerType === 'mouse' };
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    restartGesture(event.currentTarget);
    if (zoomed) setIsDragging(true);
  };

  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const pointers = pointersRef.current;
    const gesture = gestureRef.current;
    if (!gesture || !pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const { mid, spread } = measure(pointers);
    const shift = { x: mid.x - gesture.start.x, y: mid.y - gesture.start.y };
    if (!pressRef.current.moved) {
      if (Math.hypot(shift.x, shift.y) < tapSlop) return;
      pressRef.current.moved = true;
    }

    const { startView } = gesture;
    if (gesture.spread) {
      // A pinch stops at fit, or where it started below it: zooming further out is for the buttons and the wheel
      const pinched = Math.max(Math.min(1, startView.zoom), startView.zoom * (spread / gesture.spread));
      const scaled = zoomAt(startView, pinched, fromCentre(gesture.viewport, gesture.start));
      gesture.view = scaled.zoom > 1 ? { ...scaled, offset: { x: scaled.offset.x + shift.x, y: scaled.offset.y + shift.y } } : scaled;
    } else if (startView.zoom > 1) {
      gesture.view = { ...startView, offset: { x: startView.offset.x + shift.x, y: startView.offset.y + shift.y } };
    } else return; // at fit one pointer swipes the carousel

    // Captured, a mouse drag keeps its moves and its release outside the viewport
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
    if (gestureFrameRef.current) return;
    gestureFrameRef.current = requestAnimationFrame(() => {
      gestureFrameRef.current = 0;
      if (gestureRef.current) writeView(gestureRef.current.viewport, gestureRef.current.view);
    });
  };

  const pointerUp = (event: PointerEvent<HTMLElement>) => {
    const pointers = pointersRef.current;
    const gesture = gestureRef.current;
    if (!pointers.delete(event.pointerId) || !gesture) return;
    if (pointers.size) {
      restartGesture(gesture.viewport);
      return;
    }
    cancelAnimationFrame(gestureFrameRef.current);
    gestureFrameRef.current = 0;
    gestureRef.current = null;
    setIsDragging(false);
    // The cancelled frame may hold the last move: the DOM must match the view committed here
    writeView(gesture.viewport, gesture.view);
    setView(gesture.view);
  };

  const panProps = {
    style: {
      userSelect: 'none',
      // The browser zooms and scrolls nothing here: two fingers pinch the image, one drags it or swipes the carousel
      touchAction: 'none',
      cursor: zoomed ? (isDragging ? 'grabbing' : 'grab') : undefined,
      '--zoom': zoom,
      '--pan-x': offset.x,
      '--pan-y': offset.y,
    } as const,
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerUp: pointerUp,
    onPointerCancel: pointerUp,
    // An uncaptured mouse released outside sends no pointerup here
    onPointerLeave: pointerUp,
    // A second tap on the image soon after the first toggles the zoom; a lone mouse click while zoomed brings its
    // point to the centre, which on touch would jump ahead of a double tap.
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (pressRef.current.moved) return;
      if (!(event.target instanceof HTMLImageElement)) {
        lastTapRef.current = null;
        onBackdropClick?.();
        return;
      }
      const point = fromCentre(event.currentTarget, { x: event.clientX, y: event.clientY });
      const last = lastTapRef.current;
      const isDouble =
        !!last && event.timeStamp - last.time < doubleTapMs && Math.hypot(point.x - last.point.x, point.y - last.point.y) < doubleTapSlop;
      lastTapRef.current = isDouble ? null : { time: event.timeStamp, point };
      if (isDouble) setView((prev) => (prev.zoom > 1 ? fit : zoomAt(prev, doubleTapZoom, point)));
      else if (zoomed && pressRef.current.mouse) setView((prev) => ({ ...prev, offset: { x: prev.offset.x - point.x, y: prev.offset.y - point.y } }));
    },
    // A trackpad pinch is a ctrlKey wheel with small deltas; one exponential scale serves it and the mouse wheel, multiplied per frame.
    onWheel: (event: WheelEvent<HTMLElement>) => {
      wheelAnchorRef.current = fromCentre(event.currentTarget, { x: event.clientX, y: event.clientY });
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
    // React wheel listeners are passive, so the viewport cancels the page scroll in a listener of its own
    ref: (viewport: HTMLElement | null) => {
      viewport?.addEventListener('wheel', blockPageWheel, { passive: false });
      return () => viewport?.removeEventListener('wheel', blockPageWheel);
    },
  };

  return {
    rotation,
    /** Zoomed in, so there is something to pan to. */
    zoomed,
    // The drag one step at a time, for the arrow keys
    panBy: (x: number, y: number) => setView((prev) => ({ ...prev, offset: { x: prev.offset.x + x, y: prev.offset.y + y } })),
    panProps,
    layerStyle,
    zoomIn: () => setView((prev) => zoomAt(prev, prev.zoom + zoomStep)),
    zoomOut: () => setView((prev) => zoomAt(prev, prev.zoom - zoomStep)),
    rotateRight: () => setRotation((prev) => (prev + 1) % 4),
    reset: () => {
      setView(fit);
      setRotation(0);
    },
  };
}
