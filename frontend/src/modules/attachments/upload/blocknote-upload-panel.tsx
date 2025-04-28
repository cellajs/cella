import type { PartialBlock } from '@blocknote/core';
import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { DialogDescription } from '@radix-ui/react-dialog';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { UploadedUppyFile } from '~/lib/imado/types';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import UploadUppy from '~/modules/attachments/upload/upload-uppy';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers';
import { getPriasignedUrl } from '~/modules/system/api';
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
  organizationId?: string;
  onCreateCallback?: (result: UploadedUppyFile<'attachment'>) => void;
}

const UppyFilePanel = ({ organizationId, onCreateCallback, ...props }: UppyFilePanelProps & FilePanelProps) => {
  const { t } = useTranslation();
  const { block } = props;
  const { isOnline } = useOnlineManager();

  const editor = useBlockNoteEditor(customSchema);
  const type = (block.type as keyof typeof basicBlockTypes) || 'file';

  const closeFilePanel = () => {
    editor.filePanel?.closeMenu();
    focusEditor(editor);
  };

  // Close file panel if user goes offline
  useEffect(() => {
    if (!isOnline) closeFilePanel();
  }, [isOnline]);

  // Ensure focus is returned to editor when unmounting
  useEffect(() => {
    return () => focusEditor(editor);
  }, []);

  return (
    <Dialog defaultOpen={isOnline} onOpenChange={() => closeFilePanel()}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="h-6">{t('common:upload_item', { item: t(`common:${type}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden" />
        </DialogHeader>
        <UploadUppy
          isPublic={false}
          uploadType="personal"
          templateId="attachment"
          organizationId={organizationId}
          restrictions={{
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxNumberOfFiles: 1,
            allowedFileTypes: basicBlockTypes[type].allowedFileTypes,
            maxTotalFileSize: 10 * 1024 * 1024, // 10MB
          }}
          plugins={basicBlockTypes[type].plugins}
          callback={async (result) => {
            const attachments = parseUploadedAttachments(result, organizationId ?? 'prewiew');

            // Map all attachments to promises of getting presigned URLs
            const presignedUrls = await Promise.all(attachments.map((attachment) => getPriasignedUrl({ key: attachment.url })));
            for (let index = 0; index < attachments.length; index++) {
              const attachment = attachments[index];
              //TODO(IMPROVE) preasigned url creation after upload on server
              const presignedUrl = presignedUrls[index];

              const updateData: PartialBlock = {
                props: {
                  name: attachment.filename,
                  url: presignedUrl ?? attachment.url,
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
