import type { UploadResult, UppyFile } from '@uppy/core';

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
  statusEventHandler?: {
    onFileEditorComplete?: (file: LocalFile) => void;
    onUploadStart?: (uploadId: string, files: LocalFile[]) => void;
    onError?: (error: Error) => void;
    onComplete?: (mappedResult: UploadedUppyFile[], result: UploadResult<UppyMeta, UppyBody>) => void;
    onRetryComplete?: (mappedResult: UploadedUppyFile[], localStoreIds: string[]) => void;
  };
}
