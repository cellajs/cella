import { uploadTemplates } from '../../config/transloadit-config.ts';
import type { UploadTemplateId } from '../../types.ts';

/** The fields of an upload template that decide its storage; the flags are optional so a template may omit them. */
type TemplateStorage = { use: readonly string[]; publicBucket?: boolean; systemAdminOnly?: boolean };

/** Storage prefix of system uploads (newsletter images). Organization ids are UUIDs, so none can equal it. */
export const systemUploadPrefix = 'system';

/**
 * Whether uploads through `templateId` are stored public-read in the public bucket. The template decides, never the
 * client, and a template that does not say so stores privately.
 */
export const isPublicUploadTemplate = (templateId: UploadTemplateId): boolean => {
  const template: TemplateStorage = uploadTemplates[templateId];
  return template.publicBucket === true;
};

/**
 * Whether only a system admin may upload through `templateId`. Such uploads belong to no organization: they are stored
 * under `systemUploadPrefix`.
 */
export const isSystemUploadTemplate = (templateId: UploadTemplateId): boolean => {
  const template: TemplateStorage = uploadTemplates[templateId];
  return template.systemAdminOnly === true;
};
