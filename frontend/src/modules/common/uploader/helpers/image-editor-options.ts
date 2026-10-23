import type { ImageEditorOptions } from '@uppy/image-editor';
import type { UploadTemplateId } from 'shared';

/** Templates that take one cropped image, by the aspect ratio they crop to. */
const imageAspectRatios: Partial<Record<UploadTemplateId, number>> = { avatar: 1, cover: 3 };

export const isImageTemplate = (templateId: UploadTemplateId) => templateId in imageAspectRatios;

const baseCropperOptions = {
  guides: false,
  center: false,
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

export const getImageEditorOptions = (templateId: UploadTemplateId): ImageEditorOptions => ({
  quality: 0.9,
  actions: baseActions,
  cropperOptions: { ...baseCropperOptions, aspectRatio: imageAspectRatios[templateId] },
});
