import type { ImageEditorOptions } from '@uppy/image-editor';
import type { UploadTemplateId } from 'config';

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

export const getImageEditorOptions = (mode: UploadTemplateId | undefined): ImageEditorOptions => {
  const options: ImageEditorOptions = {
    quality: 0.9,
    actions: baseActions,
    cropperOptions: baseCropperOptions,
  };

  if (!options.cropperOptions) return options;

  if (mode === 'cover') options.cropperOptions.aspectRatio = 3 / 1;
  if (mode === 'avatar') options.cropperOptions.aspectRatio = 1;

  return options;
};
