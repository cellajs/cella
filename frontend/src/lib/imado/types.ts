import type { UppyFile } from '@uppy/core';
import type { UploadTemplateId } from 'config';

export type UppyMeta = { public?: boolean; contentType?: string; offlineUploaded?: boolean };

export type LocalFile = UppyFile<UppyMeta, UppyBody>;

export type UploadedUppyFile = { file: LocalFile; url: string };

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
    onComplete?: (mappedResult: UploadedUppyFile[]) => void;
    onRetrySuccess?: (mappedResult: UploadedUppyFile[], localStoreIds: string[]) => void;
  };
}
