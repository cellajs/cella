import { useEffect, useState } from 'react';
import { getBlockPendingUpload, type PendingUpload, subscribePendingUploads } from '~/modules/attachment/helpers/pending-uploads';
import type { AnyBlockNoteEditor } from '~/modules/common/blocknote/types';

/** `gone`: the reference resolves to no file (deleted, denied, refused by the media grammar). */
type MediaFile = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'pending'; pending: PendingUpload } | { status: 'gone' };

/** The file a media block shows in the editor. A file still only on its uploader's device resolves again once it arrives. */
export function useMediaFile(editor: AnyBlockNoteEditor, url: string, attachmentId: string): MediaFile {
  const [file, setFile] = useState<MediaFile>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const resolve = async () => {
      const src = await Promise.resolve(editor.resolveFileUrl ? editor.resolveFileUrl(url) : url).catch(() => '');
      if (!active) return;
      const pending = getBlockPendingUpload({ url, attachmentId });
      if (pending) setFile({ status: 'pending', pending });
      else setFile(src ? { status: 'ready', src } : { status: 'gone' });
    };
    void resolve();
    const unsubscribe = subscribePendingUploads(() => void resolve());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [editor, url, attachmentId]);

  return file;
}
