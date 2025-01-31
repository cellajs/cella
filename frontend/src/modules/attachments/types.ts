import type { UppyFile } from '@uppy/core';
import type { z } from 'zod';
import type { UppyBody, UppyMeta } from '~/lib/imado';
import type { attachmentSchema } from '#/modules/attachments/schema';

export type Attachment = z.infer<typeof attachmentSchema>;
// Uppy and Imado upload types
export enum UploadType {
  Personal,
  Organization,
}
export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export type UploadedUppyFile = { file: UppyFile<UppyMeta, UppyBody>; url: string };
