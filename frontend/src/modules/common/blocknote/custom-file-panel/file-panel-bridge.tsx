import { FilePanelExtension } from '@blocknote/core/extensions';
import { useBlockNoteEditor, useExtension, useExtensionState } from '@blocknote/react';
import { useEffect } from 'react';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import type { UploadHostApi } from '~/modules/common/blocknote/custom-file-panel/upload-host';

/** Reports the block that opened the file panel and the live editor up to `UploadHostProvider`; closing is host-driven. */
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
