import type { Uppy, UppyOptions } from '@uppy/core';
import type { TemplateStepKeys } from '#/lib/transloadit/types';
import type { uploadTokenBodySchema } from '#/modules/me/schema';

import type { UppyFile } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { UploadTemplateId } from 'config';
import type { z } from 'zod';

export type UploadTokenData = z.infer<typeof uploadTokenBodySchema>;

type UppyBody = Record<string, unknown>;
type UppyMeta = { public: boolean; offlineUploaded: boolean };

export type CustomUppy = Uppy<UppyMeta, UppyBody>;
export type CustomUppyFile = UppyFile<UppyMeta, UppyBody>;
export type CustomUppyOpt = UppyOptions<UppyMeta, UppyBody>;

export type Plugins = ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | string)[];

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
  filetype: string;
  name: string;
  offlineUploaded: string; // boolean converted to string
  public: string; // boolean converted to string
  relativePath: string; // Can be null as string
  type: string;
};

type UploadedFile<T = Record<string, unknown>> = AssemblyResult & {
  user_meta: T;
};
