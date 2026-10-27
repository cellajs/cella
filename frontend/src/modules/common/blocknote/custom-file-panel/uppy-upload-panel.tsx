import { FilePanelExtension } from '@blocknote/core/extensions';
import { useBlockNoteEditor, useExtension } from '@blocknote/react';
import type { AssemblyResponse } from '@uppy/transloadit';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { isSystemUploadTemplate } from 'shared/utils/upload-visibility';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { attachmentBlockProps, storedFileBlockProps } from '~/modules/common/blocknote/custom-file-panel/file-block-props';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus-editor';
import { type BaseUppyFilePanelProps, type CustomBlockMediaTypes, type CustomBlockNoteEditor, isMediaBlock } from '~/modules/common/blocknote/types';
import { Spinner } from '~/modules/common/spinner';
import { createUppy, registerUppyPlugins } from '~/modules/common/uploader/helpers/uppy-helpers';
import { type CustomUppy, type Plugins, uploadResultsOf } from '~/modules/common/uploader/types';
import { UploadDashboard } from '~/modules/common/uploader/upload-dashboard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

const basicBlockTypes: Record<CustomBlockMediaTypes, { allowedFileTypes: string[]; plugins: Plugins }> = {
  image: { allowedFileTypes: ['image/*'], plugins: ['image-editor', 'screen-capture', 'webcam', 'url'] },
  video: { allowedFileTypes: ['video/*'], plugins: ['screen-capture', 'webcam', 'url'] },
  audio: { allowedFileTypes: ['audio/*'], plugins: ['audio', 'screen-capture', 'webcam', 'url'] },
  file: { allowedFileTypes: ['*/*'], plugins: ['screen-capture', 'webcam', 'url'] },
};

/** Read an image blob's intrinsic pixel size by decoding it locally; returns null when it cannot decode. */
const measureImageBlobSize = (blob: Blob): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const size = image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
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
  /** Called once the dialog has closed: reset the editor's file-panel state, refocus, and drop any host request. */
  onClose: () => void;
};

/** The block's media kind, which fixes the upload restrictions: `file` for a block of another kind or one gone. */
const mediaKindOf = (editor: CustomBlockNoteEditor, blockId: string): CustomBlockMediaTypes => {
  const block = editor.getBlock(blockId);
  return block && isMediaBlock(block) ? block.type : 'file';
};

export function UppyFilePanel({
  onComplete,
  onError,
  organizationId,
  blockId,
  mediaMode,
  templateId: ownTemplateId,
  editor,
  onClose,
}: UppyFilePanelProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  // Read once per target block: a remounted editor may no longer hold it, and a changed kind rebuilds Uppy.
  const [target, setTarget] = useState(() => ({ blockId, kind: mediaKindOf(editor, blockId) }));
  if (target.blockId !== blockId) setTarget({ blockId, kind: mediaKindOf(editor, blockId) });
  const blockType = target.kind;

  // Intrinsic image dimensions measured from the local blob during upload, keyed by attachment id.
  const imageSizesRef = useRef(new Map<string, { width: number; height: number }>());

  const [uppy, setUppy] = useState<CustomUppy | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Another block opens the dialog again; the Uppy instance stays while the block kind does.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const open = closedFor !== blockId;
  const close = () => setClosedFor(blockId);

  const handleUploadError = useEffectEvent((error: Error) => {
    console.error('Upload error:', error);
    close();
    onError?.(error);
  });

  const handleAssemblyComplete = useEffectEvent((assembly: AssemblyResponse) => {
    // A failed assembly reaches the error listener, which closes the panel
    if (assembly.error) return;

    close();
    const results = uploadResultsOf(assembly);
    // Parse once so the block reference and the persisted entity share the same id.
    const attachments = ownTemplateId ? [] : parseUploadedAttachments(results, organizationId);
    const fileBlocks = ownTemplateId
      ? storedFileBlockProps(results, ownTemplateId)
      : attachments.map((attachment) => attachmentBlockProps(attachment, blockType === 'image', mediaMode));

    for (const { measuredId, ...fileProps } of fileBlocks) {
      const props = { ...fileProps, ...(measuredId ? imageSizesRef.current.get(measuredId) : undefined) };

      const targetBlock = editor.getBlock(blockId);
      if (targetBlock) {
        editor.updateBlock(targetBlock, { props });
      } else {
        // A remount can drop the placeholder block before completion, so append a fresh one to keep the attachment referenced.
        const doc = editor.document;
        const ref = doc[doc.length - 1];
        if (ref) editor.insertBlocks([{ type: blockType, props }], ref, 'after');
      }
    }

    // The host persists these attachments; the block already references their ids and keys.
    if (!ownTemplateId) onComplete?.(attachments);
  });

  useEffect(() => {
    let isMounted = true;
    let localUppy: CustomUppy | null = null;
    setIsInitializing(true);

    // Attachment modes upload through the attachment template; a block without an attachment row names its own.
    const templateId = ownTemplateId ?? 'attachment';
    const { allowedFileTypes, plugins } = basicBlockTypes[blockType];

    createUppy(
      { restrictions: { ...appConfig.uppy.defaultRestrictions, allowedFileTypes } },
      // A system upload belongs to no organization, so its token request names none.
      { templateId, organizationId: isSystemUploadTemplate(templateId) ? undefined : organizationId },
    )
      .then((created) => {
        localUppy = created;
        created
          .on('error', (error) => handleUploadError(error))
          .on('file-added', async (file) => {
            // Measure during upload so the block can reserve the correct box before the image loads.
            if (!file.type?.startsWith('image/') || !file.meta.attachmentId || !(file.data instanceof Blob)) return;
            const size = await measureImageBlobSize(file.data);
            if (size) imageSizesRef.current.set(file.meta.attachmentId, size);
          })
          .on('transloadit:complete', (assembly) => handleAssemblyComplete(assembly));

        registerUppyPlugins(created, plugins, templateId);

        if (isMounted) setUppy(created);
        else created.destroy();
      })
      .catch((error) => console.error('Failed to initialize upload:', error))
      .finally(() => {
        if (isMounted) setIsInitializing(false);
      });

    return () => {
      isMounted = false;
      setUppy(null);
      localUppy?.destroy();
    };
  }, [blockType, organizationId, ownTemplateId]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()} onOpenChangeComplete={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader className="with-close-btn">
          <DialogTitle className="h-6">{t('c:upload_item', { item: t(`c:${blockType}`).toLowerCase() })}</DialogTitle>
          <DialogDescription className="hidden">{isOnline ? t('c:loading') : t('c:offline')}</DialogDescription>
        </DialogHeader>

        {uppy ? (
          <UploadDashboard uppy={uppy} />
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
