import type { UploadTemplateId } from 'shared';
import { create } from 'zustand';
import type { CustomUppyOpt, Plugins, StatusEventHandlers } from '~/modules/common/uploader/types';

type CommonUploadData = {
  id: number | string;
  templateId: UploadTemplateId;
  plugins?: Plugins;
  restrictions?: Partial<CustomUppyOpt['restrictions']>;
  statusEventHandler?: StatusEventHandlers;
  // Dialog props
  title?: string;
  description?: string;
};

type UploadData =
  | (CommonUploadData & { personalUpload: true; organizationId?: never })
  | (CommonUploadData & { personalUpload: false; organizationId: string });

interface UploadStoreState {
  uploaderConfig: UploadData | null;

  create: (data: UploadData) => void;
  remove: () => void;
}

export const useUploader = create<UploadStoreState>((set) => ({
  uploaderConfig: null,

  create: (data) => {
    set({ uploaderConfig: data });
  },

  remove: () => {
    set({ uploaderConfig: null });
  },
}));

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useUploader as uploader };
