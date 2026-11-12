import { audioParse, fileParse, imageParse, videoParse } from '@blocknote/core';
import { FilePanelExtension } from '@blocknote/core/extensions';
import { createReactBlockSpec, useExtension, useExtensionState } from '@blocknote/react';
import i18n from 'i18next';
import { CloudOffIcon } from 'lucide-react';
import { type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent, useState } from 'react';
import { attachmentIdOf, type MediaBlockType } from 'shared/blocknote';
import { mediaBlockConfigs } from 'shared/utils/blocknote-schema-configs';
import { getFileKind } from '~/modules/attachment/file-placeholder';
import { getBlockPendingUpload, type PendingUpload, pendingUploadMessage } from '~/modules/attachment/helpers/pending-uploads';
import { findAttachmentInCache, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { MediaActions } from '~/modules/common/blocknote/custom-elements/media/media-actions';
import { mediaUploadsExtension } from '~/modules/common/blocknote/custom-elements/media/media-uploads-extension';
import { useMediaFile } from '~/modules/common/blocknote/custom-elements/media/use-media-file';
import { titleMaxLength } from '~/modules/common/blocknote/helpers/title-document';
import type { AnyBlockNoteEditor } from '~/modules/common/blocknote/types';
import { Spinner } from '~/modules/common/spinner';
import { useCan } from '~/modules/entities/use-can';
import { focusOnMount } from '~/utils/focus-on-mount';
import { formatBytes } from '~/utils/format-bytes';

/** The props the four media blocks share; `showPreview` and `previewWidth` are those of a block that previews its file. */
interface MediaProps {
  url: string;
  name: string;
  caption: string;
  attachmentId: string;
  width: number;
  height: number;
  mimeType: string;
  size: number;
  excerpt: string;
  showPreview?: boolean;
  previewWidth?: number;
}

interface MediaBlockShape {
  id: string;
  type: MediaBlockType;
  props: MediaProps;
}

interface MediaRenderProps {
  block: MediaBlockShape;
  editor: AnyBlockNoteEditor;
}

const previews = (block: MediaBlockShape) => block.type !== 'file' && block.props.showPreview !== false;

/** An image's or a video's box, reserved from its stored pixel size: the document does not move when the file loads. */
const boxStyle = ({ width, height }: MediaProps): CSSProperties | undefined =>
  width && height ? { aspectRatio: `${width} / ${height}`, width: '100%', maxWidth: '100%', height: 'auto' } : undefined;

/** A reference the static render's second pass has turned into a URL; an attachment id or a storage key loads nothing. */
const isLoadableUrl = (url: string) => /^(https?:|blob:)/.test(url);

function MediaElement({ block, src }: { block: MediaBlockShape; src: string | undefined }) {
  const { name } = block.props;
  if (block.type === 'image') return <img className="bn-visual-media" src={src} alt={name} style={boxStyle(block.props)} draggable={false} />;
  if (block.type === 'video') {
    return (
      // biome-ignore lint/a11y/useMediaCaption: a user's upload carries no caption track
      <video className="bn-visual-media" src={src} style={boxStyle(block.props)} controls draggable={false} />
    );
  }
  // biome-ignore lint/a11y/useMediaCaption: a user's upload carries no caption track
  return <audio className="bn-audio" src={src} controls draggable={false} />;
}

/** A file as a row: the icon and word of its kind, its name and size, and a text file's first lines. */
function FileRow({ block, state }: { block: MediaBlockShape; state?: ReactNode }) {
  const { name, mimeType, size, excerpt } = block.props;
  const kind = getFileKind(mimeType || (block.type === 'file' ? undefined : block.type));
  const Icon = kind.icon;
  return (
    <div className="bn-file-row">
      <div className="bn-file-row-main">
        {state ?? <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />}
        <span className="bn-file-row-name">{name}</span>
        <span className="bn-file-row-meta">{[i18n.t(kind.label), size > 0 && formatBytes(size)].filter(Boolean).join(' · ')}</span>
      </div>
      {excerpt && <pre className="bn-file-row-excerpt">{excerpt}</pre>}
    </div>
  );
}

function PendingPlaceholder({ pending, props }: { pending: PendingUpload; props: MediaProps }) {
  const { key, params } = pendingUploadMessage(pending);
  const { width, height, previewWidth } = props;
  const style = { aspectRatio: width && height ? `${width} / ${height}` : undefined, width: previewWidth ? `${previewWidth}px` : '100%' };
  return (
    <div className="bn-pending-upload" title={i18n.t('c:appears_once_uploaded')} style={style}>
      <CloudOffIcon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
      <span>{i18n.t(key, params)}</span>
    </div>
  );
}

const previewWidthStyle = (block: MediaBlockShape): CSSProperties | undefined =>
  block.type === 'audio' ? undefined : { width: block.props.previewWidth ? `${block.props.previewWidth}px` : 'fit-content' };

/** A media block outside a mounted editor (the static render): drawn once from its props, the URL already resolved or absent. */
function StaticMedia({ block }: { block: MediaBlockShape }) {
  const { url, caption } = block.props;
  if (!url) return null;

  const pending = getBlockPendingUpload(block.props);
  const showsPreview = !pending && previews(block);
  return (
    <div className="bn-file-block-content-wrapper" style={showsPreview ? previewWidthStyle(block) : undefined}>
      {pending && <PendingPlaceholder pending={pending} props={block.props} />}
      {showsPreview && (
        <div className="bn-visual-media-wrapper">
          <MediaElement block={block} src={isLoadableUrl(url) ? url : undefined} />
        </div>
      )}
      {!pending && !showsPreview && <FileRow block={block} />}
      {caption && <p className="bn-file-caption">{caption}</p>}
    </div>
  );
}

const baseNameOf = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name);
const extensionOf = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : '');

interface InlineFieldProps {
  label: string;
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/** One line of text edited in place on the file: its name or its caption. Enter and leaving the field save, Escape cancels. */
function InlineField({ label, value, onSave, onCancel }: InlineFieldProps) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      ref={focusOnMount}
      className="bn-file-field"
      aria-label={label}
      value={draft}
      maxLength={titleMaxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onSave(draft.trim())}
      onKeyDown={(event) => {
        // The editor around it commits and closes on these keys.
        event.stopPropagation();
        if (event.key === 'Enter') onSave(draft.trim());
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

interface NameFieldProps extends MediaRenderProps {
  onDone: () => void;
}

/** Renames the file in the document. Its attachment row takes the name too, where one is cached. */
function NameField({ block, editor, onDone }: NameFieldProps) {
  const row = findAttachmentInCache(attachmentIdOf(block.props) ?? '');
  const rename = (name: string) => {
    if (name) editor.updateBlock(block.id, { props: { name: `${name}${extensionOf(block.props.name)}` } });
    onDone();
  };
  const field = { label: i18n.t('c:name'), value: baseNameOf(block.props.name), onCancel: onDone };
  return row ? <AttachmentNameField row={row} field={field} onRename={rename} /> : <InlineField {...field} onSave={rename} />;
}

interface AttachmentNameFieldProps {
  row: NonNullable<ReturnType<typeof findAttachmentInCache>>;
  field: Omit<InlineFieldProps, 'onSave'>;
  onRename: (name: string) => void;
}

function AttachmentNameField({ row, field, onRename }: AttachmentNameFieldProps) {
  const can = useCan();
  const update = useAttachmentUpdateMutation(row.tenantId, row.organizationId);
  const save = (name: string) => {
    // The document's own name changes whoever edits it; the row only for someone who may update it.
    if (name && name !== row.name && can('update', 'attachment', row)) update.mutate({ id: row.id, ops: { name } });
    onRename(name);
  };
  return <InlineField {...field} onSave={save} />;
}

/** The handles that resize an image or a video. The width follows the pointer and is stored in `previewWidth` on release. */
function ResizeHandles({ block, editor, onDrag }: MediaRenderProps & { onDrag: (width: number | undefined) => void }) {
  const start = (side: 'left' | 'right') => (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    const startWidth = handle.parentElement?.clientWidth ?? 0;
    const startX = event.clientX;
    const maxWidth = editor.domElement?.firstElementChild?.clientWidth ?? Number.MAX_VALUE;
    let width = startWidth;
    handle.setPointerCapture(event.pointerId);

    const move = (moved: PointerEvent) => {
      const delta = side === 'left' ? startX - moved.clientX : moved.clientX - startX;
      width = Math.min(Math.max(startWidth + delta, 64), maxWidth);
      onDrag(width);
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      onDrag(undefined);
      if (width !== startWidth) editor.updateBlock(block.id, { props: { previewWidth: width } });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };

  return (
    <>
      <div className="bn-resize-handle" style={{ left: '4px' }} onPointerDown={start('left')} />
      <div className="bn-resize-handle" style={{ right: '4px' }} onPointerDown={start('right')} />
    </>
  );
}

/** A media block that holds a file, in the editor: its preview or its row, a caption, and the file's own actions. */
function FilledMedia({ block, editor }: MediaRenderProps) {
  const file = useMediaFile(editor, block.props.url, block.props.attachmentId);
  const [editing, setEditing] = useState<'name' | 'caption' | null>(null);
  const [dragWidth, setDragWidth] = useState<number>();
  const { caption } = block.props;

  const showsPreview = previews(block) && file.status !== 'gone' && file.status !== 'pending';
  const resizable = showsPreview && block.type !== 'audio' && editor.isEditable;
  const style = showsPreview ? (dragWidth ? { width: `${dragWidth}px` } : previewWidthStyle(block)) : undefined;
  const saveCaption = (value: string) => {
    editor.updateBlock(block.id, { props: { caption: value } });
    setEditing(null);
  };

  return (
    <div className="bn-file-block-content-wrapper" style={style}>
      {file.status === 'pending' && <PendingPlaceholder pending={file.pending} props={block.props} />}
      {showsPreview && (
        <div className="bn-visual-media-wrapper">
          <MediaElement block={block} src={file.status === 'ready' ? file.src : undefined} />
          {resizable && <ResizeHandles block={block} editor={editor} onDrag={setDragWidth} />}
        </div>
      )}
      {file.status !== 'pending' && !showsPreview && <FileRow block={block} />}
      {editing === 'name' && <NameField block={block} editor={editor} onDone={() => setEditing(null)} />}
      {editing === 'caption' && <InlineField label={i18n.t('c:caption')} value={caption} onSave={saveCaption} onCancel={() => setEditing(null)} />}
      {editing !== 'caption' && caption && <p className="bn-file-caption">{caption}</p>}
      <MediaActions block={block} editor={editor} onEdit={setEditing} />
    </div>
  );
}

/** An empty media block: the button that opens the upload dialog for it. */
function AddFile({ block, editor }: MediaRenderProps) {
  const filePanel = useExtension(FilePanelExtension, { editor });
  const Icon = getFileKind(block.type === 'file' ? undefined : block.type).icon;
  const texts: Record<string, string> = editor.dictionary.file_blocks.add_button_text;
  return (
    <div className="bn-file-block-content-wrapper">
      <button
        type="button"
        className="bn-add-file-button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => editor.isEditable && editor.transact(() => filePanel.showMenu(block.id))}
      >
        <span className="bn-add-file-button-icon">
          <Icon className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="bn-add-file-button-text">{texts[block.type] ?? texts.file}</span>
      </button>
    </div>
  );
}

function LiveMedia({ block, editor }: MediaRenderProps) {
  const uploading = useExtensionState(mediaUploadsExtension, { editor, selector: (state) => state.uploading.has(block.id) });
  if (uploading) {
    return (
      <div className="bn-file-block-content-wrapper">
        <FileRow block={block} state={<Spinner size="sm" noDelay />} />
      </div>
    );
  }
  return block.props.url ? <FilledMedia block={block} editor={editor} /> : <AddFile block={block} editor={editor} />;
}

function MediaBlock({ block, editor }: MediaRenderProps) {
  return editor.headless ? <StaticMedia block={block} /> : <LiveMedia block={block} editor={editor} />;
}

/** A media block as portable HTML, for the clipboard and for a document sent as HTML. */
function ExternalMedia({ block }: MediaRenderProps) {
  const { url, name, caption, width, height, previewWidth } = block.props;
  if (!url) return <p>{name}</p>;

  let media = <a href={url}>{name || url}</a>;
  if (previews(block)) {
    const box = width && height ? { ...boxStyle(block.props), width: previewWidth ? `${previewWidth}px` : '100%' } : undefined;
    if (block.type === 'image') media = <img src={url} alt={name} width={previewWidth} style={box} />;
    // biome-ignore lint/a11y/useMediaCaption: a user's upload carries no caption track
    if (block.type === 'video') media = <video src={url} width={previewWidth} />;
    // biome-ignore lint/a11y/useMediaCaption: a user's upload carries no caption track
    if (block.type === 'audio') media = <audio src={url} />;
  }
  if (!caption) return media;
  return (
    <figure>
      {media}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

const extensions = [mediaUploadsExtension()];

/**
 * The four file-carrying blocks, drawn by the app: BlockNote's node names and props (shared with the Yjs relay through
 * `mediaBlockConfigs`), its parse rules and class names, with a file's kind, size, upload state and actions on the block.
 */
export const mediaBlocks = {
  audio: createReactBlockSpec(
    mediaBlockConfigs.audio,
    { meta: { fileBlockAccept: ['audio/*'] }, render: MediaBlock, toExternalHTML: ExternalMedia, parse: audioParse({}), runsBefore: ['file'] },
    extensions,
  ),
  file: createReactBlockSpec(
    mediaBlockConfigs.file,
    { meta: { fileBlockAccept: ['*/*'] }, render: MediaBlock, toExternalHTML: ExternalMedia, parse: fileParse() },
    extensions,
  ),
  image: createReactBlockSpec(
    mediaBlockConfigs.image,
    { meta: { fileBlockAccept: ['image/*'] }, render: MediaBlock, toExternalHTML: ExternalMedia, parse: imageParse({}), runsBefore: ['file'] },
    extensions,
  ),
  video: createReactBlockSpec(
    mediaBlockConfigs.video,
    { meta: { fileBlockAccept: ['video/*'] }, render: MediaBlock, toExternalHTML: ExternalMedia, parse: videoParse({}), runsBefore: ['file'] },
    extensions,
  ),
};
