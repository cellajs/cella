import { FilePanelExtension } from '@blocknote/core/extensions';
import { useBlockNoteEditor, useExtension } from '@blocknote/react';
import type { AssemblyResponse } from '@uppy/transloadit';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type UploadTemplateId } from 'shared';
import { uploadTemplates } from 'shared/transloadit-config';
import { isSystemUploadTemplate, maxFilesPerUpload } from 'shared/utils/upload-visibility';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { flagBlocks, isFlagged } from '~/modules/common/blocknote/custom-elements/media/media-uploads-extension';
import {
  attachmentBlockProps,
  type FileBlockProps,
  readFileFacts,
  writeFileBlocks,
} from '~/modules/common/blocknote/custom-file-panel/file-insertion';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus-editor';
import {
  type CustomBlockMediaTypes,
  type CustomBlockNoteEditor,
  type EditorMedia,
  isMediaBlock,
  type MediaUpload,
} from '~/modules/common/blocknote/types';
import { Spinner } from '~/modules/common/spinner';
import { createUppy, registerUppyPlugins } from '~/modules/common/uploader/helpers/uppy-helpers';
import { type CustomUppy, type Plugins, type UploadResults, uploadResultsOf } from '~/modules/common/uploader/types';
import { UploadDashboard } from '~/modules/common/uploader/upload-dashboard';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/modules/ui/dialog';

const basicBlockTypes: Record<CustomBlockMediaTypes, { allowedFileTypes: string[]; plugins: Plugins }> = {
  image: { allowedFileTypes: ['image/*'], plugins: ['image-editor', 'screen-capture', 'webcam', 'url'] },
  video: { allowedFileTypes: ['video/*'], plugins: ['screen-capture', 'webcam', 'url'] },
  audio: { allowedFileTypes: ['audio/*'], plugins: ['audio', 'screen-capture', 'webcam', 'url'] },
  file: { allowedFileTypes: ['*/*'], plugins: ['screen-capture', 'webcam', 'url'] },
};

/** An editor's media that uploads: what the upload dialog works from. */
export type UploadingMedia = EditorMedia & { upload: MediaUpload };

/** Files a template without an attachment row stored: each block keeps the stored key of the exported image, with the id its facts were read under. */
const storedFileBlockProps = (results: Partial<UploadResults<UploadTemplateId>>, templateId: UploadTemplateId) => {
  const [exported] = uploadTemplates[templateId].use;
  return (results[exported] ?? []).map((file) => ({
    props: { name: file.original_name ?? file.name ?? '', url: file.url ?? '', mimeType: file.mime ?? undefined },
    factsId: file.user_meta.attachmentId,
  }));
};

/** The block's media kind, which fixes the upload restrictions: `file` for a block of another kind or one gone. */
const mediaKindOf = (editor: CustomBlockNoteEditor, blockId: string): CustomBlockMediaTypes => {
  const block = editor.getBlock(blockId);
  return block && isMediaBlock(block) ? block.type : 'file';
};

/** Takes out the empty block an "Add files" press made, once its dialog closed without a file. */
const removeUnusedAddedBlock = (editor: CustomBlockNoteEditor, blockId: string) => {
  if (!isFlagged(editor, 'added', blockId)) return;
  flagBlocks(editor, 'added', [blockId], false);
  const block = editor.getBlock(blockId);
  if (block && isMediaBlock(block) && !block.props.url) editor.removeBlocks([blockId]);
};

interface UppyFilePanelProps {
  media: UploadingMedia;
  blockId: string;
  editor: CustomBlockNoteEditor;
  /** Called once the dialog has closed: reset the editor's file-panel state, refocus, and drop any host request. */
  onClose: () => void;
}

export function UppyFilePanel({ media, blockId, editor, onClose }: UppyFilePanelProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();
  const { upload, organizationId } = media;
  // Attachment modes upload through the attachment template, several files at once; a block without a row names its own.
  const keepsRows = 'persist' in upload;
  const templateId = keepsRows ? 'attachment' : upload.templateId;

  // Read once per target block: a remounted editor may no longer hold it, and a changed kind rebuilds Uppy.
  const [target, setTarget] = useState(() => ({ blockId, kind: mediaKindOf(editor, blockId) }));
  if (target.blockId !== blockId) setTarget({ blockId, kind: mediaKindOf(editor, blockId) });
  const blockType = target.kind;

  // What each file itself tells (an image's pixel size, a text file's first characters), read while it uploads, by attachment id.
  const factsRef = useRef(new Map<string, Partial<FileBlockProps>>());

  const [uppy, setUppy] = useState<CustomUppy | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  // Another block opens the dialog again; the Uppy instance stays while the block kind does.
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const open = closedFor !== blockId;
  const close = () => setClosedFor(blockId);

  const handleUploadError = useEffectEvent((error: Error) => {
    console.error('Upload error:', error);
    close();
  });

  const handleAssemblyComplete = useEffectEvent(async (assembly: AssemblyResponse) => {
    // A failed assembly reaches the error listener, which closes the panel
    if (assembly.error) return;

    // Before the dialog has closed: the block an "Add files" press made is about to be filled, and takes its type from the file.
    const typeFromContent = isFlagged(editor, 'added', blockId);
    flagBlocks(editor, 'added', [blockId], false);
    close();

    const results = uploadResultsOf(assembly);
    const facts = factsRef.current;
    if (!keepsRows) {
      const files = storedFileBlockProps(results, templateId).map(({ props, factsId }) => ({ ...props, ...(factsId && facts.get(factsId)) }));
      return writeFileBlocks(editor, files, blockId, typeFromContent);
    }

    // Parse once so the block reference and the persisted entity share the same id.
    const attachments = parseUploadedAttachments(results, organizationId);
    // A block names its row only once the row exists: a host keeps only the ids of rows it finds. A failed create has shown its error.
    const persisted = await Promise.resolve(upload.persist(attachments)).then(
      () => true,
      () => false,
    );
    if (!persisted) return;
    const files = attachments.map((attachment) => ({ ...attachmentBlockProps(attachment, upload.mediaMode), ...facts.get(attachment.id) }));
    writeFileBlocks(editor, files, blockId, typeFromContent);
  });

  useEffect(() => {
    let isMounted = true;
    let localUppy: CustomUppy | null = null;
    setIsInitializing(true);

    const { allowedFileTypes, plugins } = basicBlockTypes[blockType];
    const { defaultRestrictions } = appConfig.uppy;
    const manyFiles = keepsRows && { maxNumberOfFiles: maxFilesPerUpload, maxTotalFileSize: maxFilesPerUpload * defaultRestrictions.maxFileSize };

    createUppy(
      { restrictions: { ...defaultRestrictions, allowedFileTypes, ...manyFiles } },
      // A system upload belongs to no organization, so its token request names none.
      { templateId, organizationId: isSystemUploadTemplate(templateId) ? undefined : organizationId },
    )
      .then((created) => {
        localUppy = created;
        created
          .on('error', (error) => handleUploadError(error))
          .on('file-added', async (file) => {
            // Read during upload, so an image block reserves its box before the image loads.
            if (!file.meta.attachmentId || !(file.data instanceof Blob)) return;
            factsRef.current.set(file.meta.attachmentId, await readFileFacts(file.data, file.type));
          })
          .on('transloadit:complete', (assembly) => void handleAssemblyComplete(assembly));

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
  }, [blockType, organizationId, templateId, keepsRows]);

  const handleClosed = () => {
    removeUnusedAddedBlock(editor, blockId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()} onOpenChangeComplete={(isOpen) => !isOpen && handleClosed()}>
      <DialogContent className="md:max-w-xl">
        <DialogHeader>
          <DialogTitle className="h-6 min-w-0 truncate leading-6">{t('c:upload_resource', { resource: t(`c:${blockType}`) })}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="hidden">{isOnline ? t('c:loading') : t('c:offline')}</DialogDescription>

        {uppy ? (
          <UploadDashboard uppy={uppy} />
        ) : (
          <div className="text-muted-foreground flex h-100 flex-col items-center justify-center gap-2 text-sm">
            {isInitializing ? <Spinner noDelay /> : null}
            <span>{isOnline ? t('c:loading') : t('c:offline')}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** File panel rendered inside the editor subtree, used when no upload host is present. */
export function InlineUppyFilePanel({ media, blockId }: { media: UploadingMedia; blockId: string }) {
  const editor = useBlockNoteEditor(customSchema);
  const filePanel = useExtension(FilePanelExtension);
  return (
    <UppyFilePanel
      media={media}
      blockId={blockId}
      editor={editor}
      onClose={() => {
        filePanel.closeMenu();
        focusEditor(editor);
      }}
    />
  );
}
