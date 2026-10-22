import type { UploadTemplateId } from 'shared';
import { create } from 'zustand';
import type { CustomUppyOptions, Plugins, UploadResults } from '~/modules/common/uploader/types';

type CommonUploadData = {
  id: number | string;
  templateId: UploadTemplateId;
  plugins?: Plugins;
  restrictions?: Partial<CustomUppyOptions['restrictions']>;
  onComplete?: (results: UploadResults<UploadTemplateId>) => void | Promise<void>;
  // Dialog props
  title?: string;
  description?: string;
};

type UploadData =
  | (CommonUploadData & { personalUpload: true; organizationId?: never })
  | (CommonUploadData & { personalUpload: false; organizationId: string });

interface UploadStoreState {
  uploadData: UploadData | null;

  create: (data: UploadData) => void;
  remove: () => void;
}

export const useUploader = create<UploadStoreState>((set) => ({
  uploadData: null,

  create: (data) => {
    set({ uploadData: data });
  },

  remove: () => {
    set({ uploadData: null });
  },
}));

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useUploader as uploader };
