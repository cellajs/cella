import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { clampZoom, WHEEL_ZOOM_SENSITIVITY, ZOOM_STEP } from '~/modules/attachment/render/image-zoom';

const blockPageWheel = (e: Event) => e.preventDefault();

/**
 * Zoom, pan and rotation of the dialog image viewer. Spread `panProps` on the viewport and put `layerStyle` on
 * the layer that holds the image. Zoom is anchored at the centre; a drag pans only while `panEnabled`.
 */
export function usePanZoom(panEnabled: boolean) {
  const [zoom, setZoomState] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  // Pointer position and offset at the start of the current drag
  const dragStart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  // Removes the window mouseup listener of the current mouse drag
  const stopWindowRelease = useRef<(() => void) | null>(null);

  // Every input (buttons, wheel, trackpad pinch) goes through the same clamp.
  const setZoom = (next: number) => setZoomState(clampZoom(next));

  useEffect(
    () => () => {
      document.removeEventListener('wheel', blockPageWheel);
      stopWindowRelease.current?.();
    },
    [],
  );

  const panEnd = () => {
    stopWindowRelease.current?.();
    stopWindowRelease.current = null;
    dragStart.current = null;
    setIsPanning(false);
  };

  const panStart = (pageX: number, pageY: number, e: React.MouseEvent | React.TouchEvent) => {
    if (!panEnabled) return;
    dragStart.current = { x: pageX, y: pageY, dx: offset.x, dy: offset.y };
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
    const start = dragStart.current;
    if (start) setOffset({ x: start.dx + pageX - start.x, y: start.dy + pageY - start.y });
  };

  const panProps = {
    style: { userSelect: 'none', cursor: isPanning ? 'move' : undefined } as const,
    onMouseDown: (e: React.MouseEvent) => panStart(e.pageX, e.pageY, e),
    onMouseMove: (e: React.MouseEvent) => panMove(e.pageX, e.pageY),
    onMouseUp: panEnd,
    onTouchStart: (e: React.TouchEvent) => panStart(e.touches[0].pageX, e.touches[0].pageY, e),
    onTouchMove: (e: React.TouchEvent) => panMove(e.touches[0].pageX, e.touches[0].pageY),
    onTouchEnd: panEnd,
    // A trackpad pinch arrives as a ctrlKey wheel with small deltas: the exponential step keeps pinch and mouse
    // wheel continuous, and the clamp sets the floor and ceiling.
    onWheel: (e: React.WheelEvent) => {
      const deltaY = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY;
      setZoom(zoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY));
    },
    // React wheel listeners are passive, so page scrolling is blocked from the document while hovering
    onMouseEnter: () => document.addEventListener('wheel', blockPageWheel, { passive: false }),
    onMouseLeave: () => document.removeEventListener('wheel', blockPageWheel),
  };

  return {
    rotation,
    panProps,
    layerStyle: { transform: `matrix(${zoom},0,0,${zoom},${offset.x},${offset.y})` },
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
