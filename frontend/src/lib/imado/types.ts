import type { uploadTokenBodySchema } from '#/modules/me/schema';

import type { UppyFile } from '@uppy/core';
import type { UploadTemplateId } from 'config';
import type { z } from 'zod';
import type { processedSteps } from '~/lib/imado/helpers';

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
    onComplete?: (mappedResult: UploadedUppyFile) => void;
    onRetrySuccess?: (mappedResult: UploadedUppyFile, localStoreIds: string[]) => void;
  };
}

// Type that represents the keys from processedSteps plus ":original"
type ProcessedStepKeys = (typeof processedSteps)[number] | ':original';

type UploadedFile<T = Record<string, unknown>> = {
  basename: string;
  cost: number;
  exec_time: number;
  ext: string;
  field: string;
  from_batch_import: boolean;
  id: string;
  is_temp_url: boolean;
  is_tus_file: boolean;
  md5hash: string;
  mime: string;
  name: string;
  original_basename: string;
  original_id: string;
  original_md5hash: string;
  original_name: string;
  original_path: string;
  queue: string;
  queue_time: number;
  size: number;
  ssl_url: string;
  tus_upload_url: string | null;
  type: string | null;
  url: string;
  user_meta: T;
};

// Use a mapped object type for the index signature
export type UploadedUppyFile = {
  [key in ProcessedStepKeys]: UploadedFile[];
};
