import type { PartialBlock } from '@blocknote/core';
import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { DialogDescription } from '@radix-ui/react-dialog';
import type React from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { UploadType, type UploadedUppyFile } from '~/modules/attachments/types';
import UploadUppy from '~/modules/attachments/upload/upload-uppy';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

const basicBlockTypes = {
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

interface UppyFilePanelProps {
  onCreateCallback?: (result: UploadedUppyFile[]) => void;
}

const UppyFilePanel: React.FC<UppyFilePanelProps & FilePanelProps> = ({ onCreateCallback, ...props }) => {
  const { t } = useTranslation();
  const { block } = props;
  const { isOnline } = useOnlineManager();

  const editor = useBlockNoteEditor();
  const type = (block.type as keyof typeof basicBlockTypes) || 'file';

  useEffect(() => {
    if (isOnline) return;
    editor.filePanel?.closeMenu();
  }, [isOnline]);

  return (
    <Dialog defaultOpen={isOnline} onOpenChange={() => editor.filePanel?.closeMenu()}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="h-6">{t('common:upload_item', { item: t(`common:${type}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden" />
        </DialogHeader>
        <UploadUppy
          isPublic={true}
          uploadType={UploadType.Personal}
          uppyOptions={{
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 1,
              allowedFileTypes: basicBlockTypes[type].allowedFileTypes,
              minFileSize: null,
              maxTotalFileSize: 10 * 1024 * 1024, // 10MB
              minNumberOfFiles: null,
              requiredMetaFields: [],
            },
          }}
          plugins={basicBlockTypes[type].plugins}
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
