import { usePortalElement } from '@blocknote/react';
import i18n from 'i18next';
import { CaptionsIcon, DownloadIcon, EllipsisIcon, PencilIcon, ScalingIcon, TextIcon, Trash2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { attachmentIdOf } from 'shared/blocknote';
import { useDownloader } from '~/hooks/use-downloader';
import { isTextFile } from '~/modules/attachment/file-placeholder';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import { openAttachment } from '~/modules/common/blocknote/helpers/open-attachment';
import { blocksFromText } from '~/modules/common/blocknote/helpers/pasted-text';
import type { AnyBlockNoteEditor } from '~/modules/common/blocknote/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

/** The largest text file a document takes back as text. */
const maxEmbedBytes = 256 * 1024;

interface FileRef {
  id: string;
  props: { url: string; name: string; attachmentId: string; mimeType: string; size: number };
}

/** The URL of the file as it was uploaded: an attachment's original, else what the block's reference resolves to. */
const resolveOriginalUrl = async (editor: AnyBlockNoteEditor, props: FileRef['props']): Promise<string> => {
  const attachmentId = attachmentIdOf(props);
  const original = attachmentId ? await resolveAttachmentUrl(attachmentId, null, { preferredVariant: 'original' }).catch(() => null) : null;
  return original?.url ?? (await editor.resolveFileUrl?.(props.url)) ?? '';
};

/** Puts a text file's content into the document as text, in place of its block. */
const embedAsText = async (editor: AnyBlockNoteEditor, { id, props }: FileRef) => {
  const url = await resolveOriginalUrl(editor, props);
  const text = url
    ? await fetch(url)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null)
    : null;
  if (text === null) return void toaster.error(i18n.t('error:download_failed'));
  if (editor.getBlock(id)) editor.replaceBlocks([id], blocksFromText(text));
};

interface MediaActionsProps {
  block: FileRef;
  editor: AnyBlockNoteEditor;
  /** Opens the inline field for the file's name or its caption. */
  onEdit: (field: 'name' | 'caption') => void;
}

/**
 * A file's own actions, on the file: the selection toolbar is off in some editors and absent on a phone. A text file
 * also offers to become text in the document, the way back for pasted text the editor made a file of.
 */
export function MediaActions({ block, editor, onEdit }: MediaActionsProps) {
  const { t } = useTranslation();
  const portalElement = usePortalElement();
  const { download } = useDownloader();
  const editable = editor.isEditable;
  const canEmbed = editable && isTextFile(block.props.mimeType) && block.props.size <= maxEmbedBytes;

  const downloadFile = async () => {
    const url = await resolveOriginalUrl(editor, block.props);
    if (url) await download(url, block.props.name);
    else toaster.error(t('error:download_failed'));
  };

  return (
    // A text file keeps its actions in view: "Embed as text" is the way back for pasted text the editor made a file of.
    <div className="bn-file-actions" data-pinned={canEmbed || undefined} contentEditable={false}>
      {canEmbed && (
        <button type="button" className="bn-file-action" onClick={() => void embedAsText(editor, block)}>
          <TextIcon className="size-4" />
          {t('c:embed_as_text')}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="bn-file-action" aria-label={t('c:file_actions')}>
              <EllipsisIcon className="size-4" />
            </button>
          }
        />
        <DropdownMenuContent container={portalElement} align="end">
          <DropdownMenuItem onClick={() => void openAttachment(editor, block.id)}>
            <ScalingIcon className="size-4" />
            {t('c:open')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void downloadFile()}>
            <DownloadIcon className="size-4" />
            {t('c:download')}
          </DropdownMenuItem>
          {editable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEdit('name')}>
                <PencilIcon className="size-4" />
                {t('c:rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit('caption')}>
                <CaptionsIcon className="size-4" />
                {t('c:caption')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => editor.removeBlocks([block.id])}>
                <Trash2Icon className="size-4" />
                {t('c:remove')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
