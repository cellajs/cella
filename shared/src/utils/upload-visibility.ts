import { uploadTemplates } from '../../config/transloadit-config.ts';
import type { UploadTemplateId } from '../../types.ts';

/** The fields of an upload template that decide its storage; `publicBucket` is optional so a template may omit it. */
type TemplateStorage = { use: readonly string[]; publicBucket?: boolean };

/**
 * Whether uploads through `templateId` are stored public-read in the public bucket. The template decides, never the
 * client, and a template that does not say so stores privately.
 */
export const isPublicUploadTemplate = (templateId: UploadTemplateId): boolean => {
  const template: TemplateStorage = uploadTemplates[templateId];
  return template.publicBucket === true;
};
