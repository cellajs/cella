import type { PartialBlock } from '@blocknote/core';
import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { DialogDescription } from '@radix-ui/react-dialog';
import type { UppyFile } from '@uppy/core';
import { useTranslation } from 'react-i18next';
import type { UppyBody, UppyMeta } from '~/lib/imado';
import UploadUppy from '~/modules/common/upload/upload-uppy';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { UploadType } from '~/types/common';

const blockTypes = {
  image: {
    allowedFileTypes: ['image/*'],
    plugins: ['image-editor', 'screen-capture', 'webcam'],
  },
  video: {
    allowedFileTypes: ['video/*'],
    plugins: ['screen-capture', 'webcam'],
  },
  audio: {
    allowedFileTypes: ['audio/*'],
    plugins: ['audio', 'screen-capture', 'webcam'],
  },
  file: {
    allowedFileTypes: ['*/*'],
    plugins: ['screen-capture', 'webcam'],
  },
};

const UppyFilePanel =
  (
    onCreateCallback?: (
      result: {
        file: UppyFile<UppyMeta, UppyBody>;
        url: string;
      }[],
    ) => void,
  ) =>
  (props: FilePanelProps) => {
    const { t } = useTranslation();
    const { block } = props;
    const editor = useBlockNoteEditor();
    const type = (block.type as keyof typeof blockTypes) || 'file';

    return (
      <Dialog defaultOpen onOpenChange={() => editor.filePanel?.closeMenu()}>
        <DialogContent className="md:max-w-xl">
          <DialogHeader>
            <DialogTitle className="h-6">{t(`common:upload_${type}`)}</DialogTitle>
            <DialogDescription className="hidden" />
          </DialogHeader>
          <UploadUppy
            isPublic={true}
            uploadType={UploadType.Personal}
            uppyOptions={{
              restrictions: {
                maxFileSize: 10 * 1024 * 1024, // 10MB
                maxNumberOfFiles: 1,
                allowedFileTypes: blockTypes[type].allowedFileTypes,
                minFileSize: null,
                maxTotalFileSize: 10 * 1024 * 1024, // 10MB
                minNumberOfFiles: null,
                requiredMetaFields: [],
              },
            }}
            plugins={blockTypes[type].plugins}
            imageMode="attachment"
            callback={async (result) => {
              for (const res of result) {
                const updateData: PartialBlock = {
                  props: {
                    name: res.file.name,
                    url: res.url,
                  },
                };
                editor.updateBlock(block, updateData);
              }
              onCreateCallback?.(result);
            }}
          />
        </DialogContent>
      </Dialog>
    );
  };

export default UppyFilePanel;
