import { FilePanelExtension } from '@blocknote/core/extensions';
import { useBlockNoteEditor, useExtension } from '@blocknote/react';
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
import type { BaseUppyFilePanelProps, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
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

/** Read an image blob's intrinsic pixel size by decoding it locally; returns null when it cannot decode. */
const measureImageBlobSize = (blob: Blob): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const size =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null;
      URL.revokeObjectURL(url);
      resolve(size);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });

type UppyFilePanelProps = BaseUppyFilePanelProps & {
  blockId: string;
  editor: CustomBlockNoteEditor;
  /** Close the panel: reset the editor's file-panel state, refocus, and drop any host request. */
  onClose: () => void;
};

export function UppyFilePanel({
  onComplete,
  onError,
  organizationId,
  blockId,
  mediaMode,
  editor,
  onClose,
}: UppyFilePanelProps) {
  // Private media uses the private bucket and an attachment id reference; both public modes use the public bucket and a cloud key.
  const publicBucket = mediaMode !== 'private-attachment';
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const isOnline = useOnlineManager();

  // Access the editor through a ref so a swapped editor instance does not re-run the setup effect.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const latestBlockIdRef = useRef(blockId);
  latestBlockIdRef.current = blockId;
  const latestOnCompleteRef = useRef(onComplete);
  latestOnCompleteRef.current = onComplete;
  const latestOnErrorRef = useRef(onError);
  latestOnErrorRef.current = onError;
  // Intrinsic image dimensions measured from the local blob during upload, keyed by attachment id.
  const imageSizesRef = useRef(new Map<string, { width: number; height: number }>());

  // The block kind fixes the upload restrictions, so resolve it once per target block.
  const blockType = useMemo<keyof typeof basicBlockTypes>(() => {
    const block = editorRef.current.getBlock(blockId);
    return block && block.type in basicBlockTypes ? (block.type as keyof typeof basicBlockTypes) : 'file';
  }, [blockId]);

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

  // Call onClose exactly once when the dialog closes (user dismiss or completed upload).
  const closedRef = useRef(false);

  useEffect(() => {
    setOpen(Boolean(blockId));
  }, [blockId]);

  useEffect(() => {
    if (open || closedRef.current) return;
    closedRef.current = true;
    onClose();
  }, [onClose, open]);

  useEffect(() => {
    let isMounted = true;
    let localUppy: CustomUppy | null = null;
    setIsInitializing(true);

    const initializeUppy = async () => {
      try {
        localUppy = await createBaseTransloaditUppy(uppyOptions, {
          publicBucket,
          templateId: 'attachment',
          organizationId,
        });

        localUppy
          .on('error', (error) => {
            console.error('Upload error:', error);
            setOpen(false);

            latestOnErrorRef.current?.(error);
          })
          .on('file-added', async (file) => {
            // Measure during upload so the block can reserve the correct box before the image loads.
            if (!file.type?.startsWith('image/') || !file.meta.attachmentId || !(file.data instanceof Blob)) return;
            const size = await measureImageBlobSize(file.data);
            if (size) imageSizesRef.current.set(file.meta.attachmentId, size);
          })
          .on('transloadit:complete', (assembly) => {
            if (assembly?.error) throw new Error(assembly?.error);

            setOpen(false);
            const result = assembly.results as UploadedUppyFile<'attachment'>;
            // Parse once so the block reference and the persisted entity share the same id.
            const attachments = parseUploadedAttachments(result, organizationId);
            const activeEditor = editorRef.current;

            for (const attachment of attachments) {
              // Public mode stores a cloud key: images the mid-size preview, other types the converted variant, never the full-size file.
              const publicKey =
                blockType === 'image'
                  ? attachment.keys.preview || attachment.keys.converted || attachment.keys.original
                  : attachment.keys.converted || attachment.keys.original;
              const url = mediaMode === 'private-attachment' ? attachment.id : publicKey;
              const props = {
                name: attachment.filename,
                url,
                attachmentId: attachment.id,
                ...imageSizesRef.current.get(attachment.id),
              };

              const targetBlock = activeEditor.getBlock(latestBlockIdRef.current);
              if (targetBlock) {
                activeEditor.updateBlock(targetBlock, { props });
              } else {
                // A remount can drop the placeholder block before completion, so append a fresh one to keep the attachment referenced.
                const doc = activeEditor.document;
                const ref = doc[doc.length - 1];
                if (ref) activeEditor.insertBlocks([{ type: blockType, props }], ref, 'after');
              }
            }

            // The host persists these attachments; the block already references their ids and keys.
            latestOnCompleteRef.current?.(attachments);
          });

        const imageEditorOptions = getImageEditorOptions('attachment');
        const webcamOptions: WebcamOptions<Meta, Body> = {
          videoConstraints: { width: 1280, height: 720 },
          preferredVideoMimeType: 'video/webm;codecs=vp9',
        };

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
  }, [blockType, publicBucket, organizationId, uppyOptions, mediaMode]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader className="with-close-btn">
          <DialogTitle className="h-6">{t('c:upload_item', { item: t(`c:${blockType}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden">{isOnline ? t('c:loading') : t('c:offline')}</DialogDescription>
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
            <span>{isOnline ? t('c:loading') : t('c:offline')}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** File panel rendered inside the editor subtree, used when no upload host is present. */
export function InlineUppyFilePanel({ base, blockId }: { base: BaseUppyFilePanelProps; blockId: string }) {
  const editor = useBlockNoteEditor(customSchema);
  const filePanel = useExtension(FilePanelExtension);
  return (
    <UppyFilePanel
      {...base}
      blockId={blockId}
      editor={editor}
      onClose={() => {
        filePanel.closeMenu();
        focusEditor(editor);
      }}
    />
  );
}
