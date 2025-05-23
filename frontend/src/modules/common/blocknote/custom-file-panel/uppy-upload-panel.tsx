import type { PartialBlock } from '@blocknote/core';
import { type FilePanelProps, useBlockNoteEditor } from '@blocknote/react';
import { DialogDescription } from '@radix-ui/react-dialog';
import Audio from '@uppy/audio';
import type { Body, Meta } from '@uppy/core';
import ImageEditor from '@uppy/image-editor/lib/ImageEditor';
import { Dashboard } from '@uppy/react';
import ScreenCapture from '@uppy/screen-capture';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { BaseUppyFilePanelProps } from '~/modules/common/blocknote/types';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers';
import { getImageEditorOptions } from '~/modules/common/uploader/helpers/image-editor-options';
import type { CustomUppy, CustomUppyOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { useUIStore } from '~/store/ui';

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

const UppyFilePanel = ({ onComplete, onError, organizationId, block }: BaseUppyFilePanelProps & FilePanelProps) => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const { isOnline } = useOnlineManager();

  const blockType = (block.type as keyof typeof basicBlockTypes) || 'file';
  const editor = useBlockNoteEditor(customSchema);

  const [uppy, setUppy] = useState<CustomUppy | null>(null);
  const [open, setOpen] = useState(editor.filePanel?.shown);

  useEffect(() => {
    if (open) return;
    editor.filePanel?.closeMenu();
    focusEditor(editor);
  }, [open]);

  // Close file panel if user goes offline
  useEffect(() => {
    if (isOnline) return;
    setOpen(false);
    uppy?.destroy();
  }, [isOnline]);

  useEffect(() => {
    let isMounted = true;
    let localUppy: CustomUppy | null = null;

    const uppyOptions: CustomUppyOpt = {
      restrictions: {
        ...config.uppy.defaultRestrictions,
        minFileSize: null,
        minNumberOfFiles: null,
        allowedFileTypes: basicBlockTypes[blockType].allowedFileTypes,
        requiredMetaFields: [],
      },
    };

    const initializeUppy = async () => {
      try {
        localUppy = await createBaseTransloaditUppy(uppyOptions, { public: false, templateId: 'attachment', organizationId });

        localUppy
          .on('error', (error) => {
            console.error('Upload error:', error);
            setOpen(false);

            onError?.(error);
          })
          .on('transloadit:complete', (assembly) => {
            if (assembly?.error) throw new Error(assembly?.error);

            setOpen(false);
            const result = assembly.results as UploadedUppyFile<'attachment'>;
            const attachments = parseUploadedAttachments(result, organizationId);

            // Map all attachments to promises of getting presigned URLs
            for (let index = 0; index < attachments.length; index++) {
              const attachment = attachments[index];
              const updateData: PartialBlock = { props: { name: attachment.filename, url: attachment.originalKey } };
              editor.updateBlock(block, updateData);
            }

            onComplete?.(result);
          });

        // Plugin Options
        const imageEditorOptions = getImageEditorOptions('attachment');
        const webcamOptions: WebcamOptions<Meta, Body> = {
          videoConstraints: { width: 1280, height: 720 },
          preferredVideoMimeType: 'video/webm;codecs=vp9',
        };

        // Plugin Registration
        if (basicBlockTypes[blockType].plugins.includes('webcam')) localUppy.use(Webcam, webcamOptions);
        if (basicBlockTypes[blockType].plugins.includes('image-editor')) localUppy.use(ImageEditor, imageEditorOptions);
        if (basicBlockTypes[blockType].plugins.includes('audio')) localUppy.use(Audio);
        if (basicBlockTypes[blockType].plugins.includes('screen-capture'))
          localUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });

        if (!isMounted) {
          localUppy.destroy();
          return;
        }
        setUppy(localUppy);
      } catch (err) {}
    };

    initializeUppy();

    return () => {
      isMounted = false;
      setUppy(null);
      setOpen(false);
      if (localUppy) localUppy.destroy();
    };
  }, []);

  if (!uppy) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="h-6">{t('common:upload_item', { item: t(`common:${blockType}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden" />
        </DialogHeader>

        <Dashboard uppy={uppy} width="100%" height="400px" theme={mode} proudlyDisplayPoweredByUppy={false} />
      </DialogContent>
    </Dialog>
  );
};

export default UppyFilePanel;
