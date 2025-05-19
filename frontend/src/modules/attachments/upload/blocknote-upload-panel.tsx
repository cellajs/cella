import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { DialogDescription } from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
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

// TODO(REFATOR)All upload code and dialog causes focus loss in here
const UppyFilePanel = ({ organizationId, onCreateCallback, ...props }: UppyFilePanelProps & FilePanelProps) => {
  const { t } = useTranslation();
  const { block } = props;
  const { isOnline } = useOnlineManager();

  const editor = useBlockNoteEditor(customSchema);

  const [open, setOpen] = useState(editor.filePanel?.shown);

  const type = (block.type as keyof typeof basicBlockTypes) || 'file';

  useEffect(() => {
    if (open) return;
    editor.filePanel?.closeMenu();
    focusEditor(editor);
  }, [open]);

  // Close file panel if user goes offline
  useEffect(() => {
    if (!isOnline) setOpen(false);
  }, [isOnline]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="h-6">{t('common:upload_item', { item: t(`common:${type}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden" />
        </DialogHeader>
        {/* <UploadUppy
          isPublic={false}
          uploadType="organization"
          templateId="attachment"
          organizationId={organizationId}
          restrictions={{
            ...config.uppy.defaultRestrictions,
            allowedFileTypes: basicBlockTypes[type].allowedFileTypes,
          }}
          plugins={basicBlockTypes[type].plugins}
          callback={async (result) => {
            setOpen(false);
            const attachments = parseUploadedAttachments(result, organizationId ?? 'preview');
            // Map all attachments to promises of getting presigned URLs
            for (let index = 0; index < attachments.length; index++) {
              const attachment = attachments[index];
              const updateData: PartialBlock = { props: { name: attachment.filename, url: attachment.originalKey } };
              editor.updateBlock(block, updateData);
            }
            onCreateCallback?.(result);
          }}
        /> */}
      </DialogContent>
    </Dialog>
  );
};

export default UppyFilePanel;
