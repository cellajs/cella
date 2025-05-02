import type { TemplateStepKeys } from '#/lib/transloadit/types';
import type { uploadTokenBodySchema } from '#/modules/me/schema';

import type { UppyFile } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { UploadTemplateId } from 'config';
import type { z } from 'zod';

export type UppyMeta = { public?: boolean; contentType?: string; offlineUploaded?: boolean };

export type LocalFile = UppyFile<UppyMeta, UppyBody>;
export type UploadTokenData = z.infer<typeof uploadTokenBodySchema>;

// biome-ignore lint/complexity/noBannedTypes: no other way to define this type
export type UppyBody = {};

export interface UploadParams {
  public: boolean;
  organizationId?: string;
}

export interface ImadoOptions extends UploadParams {
  templateId: UploadTemplateId;
  statusEventHandler?: {
    onFileEditorComplete?: (file: LocalFile) => void;
    onUploadStart?: (uploadId: string, files: LocalFile[]) => void;
    onError?: (error: Error) => void;
    onComplete?: (mappedResult: UploadedUppyFile<UploadTemplateId>) => void;
    onRetrySuccess?: (mappedResult: UploadedUppyFile<UploadTemplateId>, localStoreIds: string[]) => void;
  };
}

type ImadoUserMeta = {
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

// Use a mapped object type for the index signature
export type UploadedUppyFile<T extends UploadTemplateId, K = ImadoUserMeta> = {
  [key in TemplateStepKeys<T>]: UploadedFile<K>[];
};
