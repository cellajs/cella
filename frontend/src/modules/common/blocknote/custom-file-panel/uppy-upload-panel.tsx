import { FilePanelExtension } from '@blocknote/core/extensions';
import { type FilePanelProps, useBlockNoteEditor, useExtension } from '@blocknote/react';
import Audio from '@uppy/audio';
import type { Body, Meta } from '@uppy/core';
import ImageEditor from '@uppy/image-editor';
import Dashboard from '@uppy/react/dashboard';
import ScreenCapture from '@uppy/screen-capture';
import { COMPANION_ALLOWED_HOSTS, COMPANION_URL } from '@uppy/transloadit';
import Url from '@uppy/url';
import Webcam, { type WebcamOptions } from '@uppy/webcam';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { BaseUppyFilePanelProps } from '~/modules/common/blocknote/types';
import { Spinner } from '~/modules/common/spinner';
import { getImageEditorOptions } from '~/modules/common/uploader/helpers/image-editor-options';
import { generateRestrictionNote } from '~/modules/common/uploader/helpers/restrictions-note';
import { createBaseTransloaditUppy } from '~/modules/common/uploader/helpers/uppy-helpers';
import type { CustomUppy, CustomUppyOpt, UploadedUppyFile } from '~/modules/common/uploader/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';
import { useUIStore } from '~/modules/ui/ui-store';

import '~/modules/common/uploader/uppy-styles';

const basicBlockTypes = {
  image: {
    allowedFileTypes: ['image/*'],
    plugins: ['image-editor', 'screen-capture', 'webcam', 'url'],
  },
  video: {
    allowedFileTypes: ['video/*'],
    plugins: ['screen-capture', 'webcam', 'url'],
  },
  audio: {
    allowedFileTypes: ['audio/*'],
    plugins: ['audio', 'screen-capture', 'webcam', 'url'],
  },
  file: {
    allowedFileTypes: ['*/*'],
    plugins: ['screen-capture', 'webcam', 'url'],
  },
};

export function UppyFilePanel({
  onComplete,
  onError,
  organizationId,
  blockId,
  mediaMode,
}: BaseUppyFilePanelProps & FilePanelProps) {
  // Private media lives in the private bucket and is referenced by attachment id;
  // both public modes use the public bucket and are referenced by cloud key.
  const isPublic = mediaMode !== 'private-attachment';
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const isOnline = useOnlineManager();

  const filePanel = useExtension(FilePanelExtension);
  const editor = useBlockNoteEditor(customSchema);

  const block = editor.getBlock(blockId);
  const latestBlockIdRef = useRef(blockId);
  latestBlockIdRef.current = blockId;
  const latestOnCompleteRef = useRef(onComplete);
  latestOnCompleteRef.current = onComplete;
  const latestOnErrorRef = useRef(onError);
  latestOnErrorRef.current = onError;

  const blockType = block && block.type in basicBlockTypes ? (block.type as keyof typeof basicBlockTypes) : 'file';
  const uppyOptions: CustomUppyOpt = useMemo(
    () => ({
      restrictions: {
        ...appConfig.uppy.defaultRestrictions,
        allowedFileTypes: basicBlockTypes[blockType].allowedFileTypes,
      },
    }),
    [blockType],
  );

  const [uppy, setUppy] = useState<CustomUppy | null>(null);
  const [open, setOpen] = useState(!!blockId);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setOpen(Boolean(blockId));
  }, [blockId]);

  useEffect(() => {
    if (open) return;
    filePanel.closeMenu();
    focusEditor(editor);
  }, [editor, filePanel, open]);

  useEffect(() => {
    let isMounted = true;
    let localUppy: CustomUppy | null = null;
    setIsInitializing(true);

    const initializeUppy = async () => {
      try {
        localUppy = await createBaseTransloaditUppy(uppyOptions, {
          public: isPublic,
          templateId: 'attachment',
          organizationId,
        });

        localUppy
          .on('error', (error) => {
            console.error('Upload error:', error);
            setOpen(false);

            latestOnErrorRef.current?.(error);
          })
          .on('transloadit:complete', (assembly) => {
            if (assembly?.error) throw new Error(assembly?.error);

            setOpen(false);
            const result = assembly.results as UploadedUppyFile<'attachment'>;
            // Parse once so the block reference and the persisted entity share the same id.
            const attachments = parseUploadedAttachments(result, organizationId);
            const currentBlock = editor.getBlock(latestBlockIdRef.current);
            if (!currentBlock) return;

            for (const attachment of attachments) {
              // Private → reference by attachment id (presigned); public → reference by cloud key (CDN).
              const url = mediaMode === 'private-attachment' ? attachment.id : attachment.originalKey;
              editor.updateBlock(currentBlock, { props: { name: attachment.filename, url } });
            }

            // Hand the parsed attachments (stable client ids) to the host so it can add
            // host linkage and persist them. The block already references these ids and keys.
            latestOnCompleteRef.current?.(attachments);
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
        if (basicBlockTypes[blockType].plugins.includes('url')) {
          localUppy.use(Url, { companionUrl: COMPANION_URL, companionAllowedHosts: COMPANION_ALLOWED_HOSTS });
        }
        if (basicBlockTypes[blockType].plugins.includes('screen-capture')) {
          localUppy.use(ScreenCapture, { preferredVideoMimeType: 'video/webm;codecs=vp9' });
        }

        if (!isMounted) {
          localUppy.destroy();
          return;
        }
        setUppy(localUppy);
      } catch (err) {
        console.error('Failed to initialize upload:', err);
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    };

    initializeUppy();

    return () => {
      isMounted = false;
      setUppy(null);
      if (localUppy) localUppy.destroy();
    };
  }, [blockType, editor, isPublic, organizationId, uppyOptions]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader className="with-close-btn">
          <DialogTitle className="h-6">{t('c:upload_item', { item: t(`c:${blockType}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden">{isOnline ? t('c:loading') : t('error:offline')}</DialogDescription>
        </DialogHeader>

        {uppy ? (
          <Dashboard
            uppy={uppy}
            width="100%"
            height="400px"
            theme={mode}
            note={generateRestrictionNote(uppyOptions.restrictions)}
            proudlyDisplayPoweredByUppy={false}
          />
        ) : (
          <div className="flex h-100 flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            {isInitializing ? <Spinner noDelay /> : null}
            <span>{isOnline ? t('c:loading') : t('error:offline')}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
