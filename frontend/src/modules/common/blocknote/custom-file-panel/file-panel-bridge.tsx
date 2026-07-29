import { FilePanelExtension } from '@blocknote/core/extensions';
import { useBlockNoteEditor, useExtension, useExtensionState } from '@blocknote/react';
import { useEffect } from 'react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { UploadHostApi } from '~/modules/common/blocknote/custom-file-panel/upload-host';

/**
 * Lives inside the editor and mirrors its file-panel state up to a stable `UploadHostProvider`: which
 * block opened the panel, and the live editor to write the result into. Renders nothing itself. Closing
 * is host-driven, so it only forwards an opened block; on remount it re-registers the fresh editor.
 */
export function FilePanelBridge({ host }: { host: UploadHostApi }) {
  const editor = useBlockNoteEditor(customSchema);
  const filePanel = useExtension(FilePanelExtension);
  const activeBlockId = useExtensionState(FilePanelExtension);

  useEffect(() => {
    host.registerEditor({ editor, closeFilePanel: () => filePanel.closeMenu() });
    return () => host.registerEditor(null);
  }, [editor, filePanel, host]);

  useEffect(() => {
    if (activeBlockId) host.openFor(activeBlockId);
  }, [activeBlockId, host]);

  return null;
}
