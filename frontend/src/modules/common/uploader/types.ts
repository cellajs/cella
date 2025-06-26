import type { Uppy, UppyFile, UppyOptions } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { UploadTemplateId } from 'config';

import type { uploadTemplates } from 'config/templates';

type UppyBody = Record<string, unknown>;
type UppyMeta = { public: boolean; offlineUploaded: boolean };

type TemplateStepKeys<T extends UploadTemplateId> = (typeof uploadTemplates)[T]['use'][number];

export type CustomUppy = Uppy<UppyMeta, UppyBody>;
export type CustomUppyFile = UppyFile<UppyMeta, UppyBody>;
export type CustomUppyOpt = UppyOptions<UppyMeta, UppyBody>;

export type Plugins = ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | 'url' | string)[];

export type StatusEventHandlers = {
  onFileEditorComplete?: (file: CustomUppyFile) => void;
  onUploadStart?: (uploadId: string, files: CustomUppyFile[]) => void;
  onError?: (error: Error) => void;
  onComplete?: (mappedResult: UploadedUppyFile<UploadTemplateId>) => void;
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
