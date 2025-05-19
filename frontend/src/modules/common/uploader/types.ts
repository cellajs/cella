import type { UppyOptions } from '@uppy/core';
import type { TemplateStepKeys } from '#/lib/transloadit/types';
import type { uploadTokenBodySchema } from '#/modules/me/schema';

import type { UppyFile } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { WebcamOptions } from '@uppy/webcam';
import type { UploadTemplateId } from 'config';
import type { z } from 'zod';

export type Plugins = ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | string)[];

export type UploadTokenData = z.infer<typeof uploadTokenBodySchema>;

// biome-ignore lint/complexity/noBannedTypes: To initialize uppy
type UppyBody = {};
// TODO(UPPYREFACTOR) proper handle of Uppy meta already have InternalMetadata
type UppyMeta = { public?: boolean; contentType?: string; offlineUploaded?: boolean };

export type CustomUppyFile = UppyFile<UppyMeta, UppyBody>;
export type CustomUppyOpt = UppyOptions<UppyMeta, UppyBody>;
export type CustomWebcamOpt = WebcamOptions<UppyMeta, UppyBody>;

export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export interface ImadoOptions extends UploadParams {
  templateId: UploadTemplateId;
  statusEventHandler?: StatusEventHandlers;
}

export type StatusEventHandlers = {
  onFileEditorComplete?: (file: CustomUppyFile) => void;
  onUploadStart?: (uploadId: string, files: CustomUppyFile[]) => void;
  onError?: (error: Error) => void;
  onComplete?: (mappedResult: UploadedUppyFile<UploadTemplateId>) => void;
  onRetrySuccess?: (mappedResult: UploadedUppyFile<UploadTemplateId>, localStoreIds: string[]) => void;
};

// Use a mapped object type for the index signature
export type UploadedUppyFile<T extends UploadTemplateId, K = UserMeta> = {
  [key in TemplateStepKeys<T>]: UploadedFile<K>[];
};
type UserMeta = {
  contentType: string;
  filetype: string;
  name: string;
  offlineUploaded: string;
  public: string;
  relativePath: string;
  type: string;
};

type UploadedFile<T = Record<string, unknown>> = AssemblyResult & {
  user_meta: T;
};
