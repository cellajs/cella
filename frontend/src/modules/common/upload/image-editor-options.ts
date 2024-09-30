import type { ImageEditorOptions } from '@uppy/image-editor';

const baseCropperOptions = {
  croppedCanvasOptions: {},
  background: false,
  autoCropArea: 1,
  responsive: true,
  guides: false,
  center: false,
  highlight: false,
  movable: false,
  rotatable: false,
  scalable: false,
  zoomable: false,
  zoomOnTouch: false,
  zoomOnWheel: false,
};

const baseActions = {
  revert: false,
  rotate: false,
  granularRotate: false,
  flip: false,
  zoomIn: false,
  zoomOut: false,
  cropSquare: false,
  cropWidescreen: false,
  cropWidescreenVertical: false,
};

export const getImageEditorOptions = (mode: 'avatar' | 'cover' | undefined): ImageEditorOptions => {
  const aspectRatio = mode === 'cover' ? 3 / 1 : 1; // Default to 1 for 'avatar' and undefined modes

  return {
    quality: 0.9,
    actions: baseActions,
    cropperOptions: {
      ...baseCropperOptions,
      aspectRatio,
    },
  };
};
