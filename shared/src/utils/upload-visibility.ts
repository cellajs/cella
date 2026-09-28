import { uploadTemplates } from '../../config/transloadit-config.ts';
import type { UploadTemplateId } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';

/** The fields of an upload template that decide its storage; the flags are optional so a template may omit them. */
type TemplateStorage = { use: readonly string[]; publicBucket?: boolean; systemAdminOnly?: boolean };

/** Storage prefix of system uploads (newsletter images). Organization ids are UUIDs, so none can equal it. */
export const systemUploadPrefix = 'system';

/**
 * Where uploads through `templateId` are stored: public-read in the public bucket when the template says so, else
 * private in the private bucket. The template decides, never the client: the signed upload, the row the server stamps
 * and the client's optimistic row all read this one answer.
 */
export const uploadStorage = (templateId: UploadTemplateId) => {
  const template: TemplateStorage = uploadTemplates[templateId];
  const publicBucket = template.publicBucket === true;
  return { publicBucket, bucketName: publicBucket ? appConfig.s3.publicBucket : appConfig.s3.privateBucket };
};

/**
 * Whether only a system admin may upload through `templateId`. Such uploads belong to no organization: they are stored
 * under `systemUploadPrefix`.
 */
export const isSystemUploadTemplate = (templateId: UploadTemplateId): boolean => {
  const template: TemplateStorage = uploadTemplates[templateId];
  return template.systemAdminOnly === true;
};
