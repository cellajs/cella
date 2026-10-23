import type { Uppy, UppyFile, UppyOptions } from '@uppy/core';
import type { AssemblyResult } from '@uppy/transloadit';
import type { UploadTemplateId } from 'shared';
import type { uploadTemplates } from 'shared/transloadit-config';

type UppyBody = Record<string, unknown>;

/** `attachmentId` is the id of the row the file becomes, round-tripped through Transloadit; `offlineUploaded` is true without cloud upload. */
type UppyMeta = { offlineUploaded: boolean; attachmentId?: string };

type TemplateStepKeys<T extends UploadTemplateId> = (typeof uploadTemplates)[T]['use'][number];

export type CustomUppy = Uppy<UppyMeta, UppyBody>;
export type CustomUppyFile = UppyFile<UppyMeta, UppyBody>;
export type CustomUppyOptions = UppyOptions<UppyMeta, UppyBody>;

export type Plugins = ('webcam' | 'image-editor' | 'audio' | 'screen-capture' | 'url' | string)[];

export type UploadResults<T extends UploadTemplateId, K = UserMeta> = {
  [key in TemplateStepKeys<T>]: UploadedFile<K>[];
};

type Stringified<T> = {
  [K in keyof T]: string;
};

type UserMeta = Stringified<UppyMeta> & {
  filetype: string;
  name: string;
  /** The string 'null' when the file has no relative path. */
  relativePath: string;
  type: string;
};

export type UploadedFile<T = Record<string, string>> = AssemblyResult & { user_meta: T };
