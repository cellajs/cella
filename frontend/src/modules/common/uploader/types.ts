import type { Uppy, UppyFile, UppyOptions } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { UploadTemplateId } from 'shared';
import type { uploadTemplates } from 'shared/transloadit-config';

type UppyBody = Record<string, unknown>;

/**
 * `attachmentId` is assigned per file in `onBeforeFileAdded` (never on the Uppy-wide meta, which
 * every file would share). It is the id the attachment row will be created with, so the local
 * blob and its row agree from the moment the file is picked — Uppy round-trips it through
 * Transloadit as `user_meta.attachmentId`.
 */
type UppyMeta = { public: boolean; bucketName: string; offlineUploaded: boolean; attachmentId?: string };

type TemplateStepKeys<T extends UploadTemplateId> = (typeof uploadTemplates)[T]['use'][number];

export type CustomUppy = Uppy<UppyMeta, UppyBody>;
export type CustomUppyFile = UppyFile<UppyMeta, UppyBody>;
export type CustomUppyOpt = UppyOptions<UppyMeta, UppyBody>;

export type Plugins = ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | 'url' | string)[];

export type StatusEventHandlers = {
  onFileEditorComplete?: (file: CustomUppyFile) => void;
  onUploadStart?: (uploadId: string, files: CustomUppyFile[]) => void;
  onError?: (error: Error) => void;
  onComplete?: (mappedResult: UploadedUppyFile<UploadTemplateId>) => void | Promise<void>;
};

// Use a mapped object type for the index signature
export type UploadedUppyFile<T extends UploadTemplateId, K = UserMeta> = {
  [key in TemplateStepKeys<T>]: UploadedFile<K>[];
};

type Stringified<T> = {
  [K in keyof T]: string;
};

type UserMeta = Stringified<UppyMeta> & {
  filetype: string;
  name: string;
  relativePath: string; // Can be null as string
  type: string;
};

export type UploadedFile<T = Record<string, string>> = AssemblyResult & {
  user_meta: T;
};
