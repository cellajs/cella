/** Zoom 1 is the CSS fit inside the dialog stage; the floor keeps a zoomed-out image visible, the ceiling keeps it navigable. */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
export const ZOOM_STEP = 0.2;
/** Per wheel pixel: a 100px mouse notch is roughly 20%, a pinch delta of a few pixels stays smooth. */
export const WHEEL_ZOOM_SENSITIVITY = 0.002;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
