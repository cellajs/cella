import type { PartialBlock } from '@blocknote/core';
import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { Dialog, DialogContent } from '~/modules/ui/dialog';
import { UploadType } from '~/types';
import UploadUppy from '../../common/upload/upload-uppy';

const UppyFilePanel = (props: FilePanelProps) => {
  const { block } = props;
  const editor = useBlockNoteEditor();

  return (
    <Dialog defaultOpen onOpenChange={() => editor.filePanel?.closeMenu()}>
      <DialogContent className="md:max-w-xl">
        <UploadUppy
          isPublic={true}
          uploadType={UploadType.Personal}
          uppyOptions={{
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 1,
              allowedFileTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
              minFileSize: null,
              maxTotalFileSize: 10 * 1024 * 1024, // 100MB
              minNumberOfFiles: null,
              requiredMetaFields: [],
            },
          }}
          plugins={['image-editor', 'screen-capture', 'webcam']}
          imageMode="cover"
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
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default UppyFilePanel;
