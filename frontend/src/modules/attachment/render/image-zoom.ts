/** Zoom 1 is the CSS fit inside the dialog stage; the floor keeps a zoomed-out image visible, the ceiling keeps it navigable. */
export const minZoom = 0.25;
export const maxZoom = 8;
export const zoomStep = 0.2;
/** Per wheel pixel: a 100px mouse notch is roughly 20%, a pinch delta of a few pixels stays smooth. */
export const wheelZoomSensitivity = 0.002;

export const clampZoom = (zoom: number) => Math.min(maxZoom, Math.max(minZoom, zoom));
