import { createContext, type ReactNode, useContext, useState } from 'react';
import { UppyFilePanel } from '~/modules/common/blocknote/custom-file-panel/uppy-upload-panel';
import { focusEditor } from '~/modules/common/blocknote/helpers/focus';
import type { BaseUppyFilePanelProps, CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Live editor handle the bridge keeps current, so the host targets the latest editor after a remount. */
interface EditorHandle {
  editor: CustomBlockNoteEditor;
  closeFilePanel: () => void;
}

/** Bridge → host channel: the editor reports which block opened its file panel and which editor is live. */
export interface UploadHostApi {
  openFor: (blockId: string) => void;
  registerEditor: (handle: EditorHandle | null) => void;
}

const UploadHostContext = createContext<UploadHostApi | null>(null);

export const useUploadHost = () => useContext(UploadHostContext);

interface UploadHostProviderProps {
  baseFilePanelProps: BaseUppyFilePanelProps;
  children: ReactNode;
}

/** Owns the Uppy dialog outside the editor subtree, so a mid-upload remount cannot tear it down; a `FilePanelBridge` reports the block and editor. */
export function UploadHostProvider({ baseFilePanelProps, children }: UploadHostProviderProps) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [handle, setHandle] = useState<EditorHandle | null>(null);

  // Stable API object: the setters are referentially stable, so the bridge's effects never re-run on it.
  const [api] = useState<UploadHostApi>(() => ({ openFor: setActiveBlockId, registerEditor: setHandle }));

  const close = () => {
    handle?.closeFilePanel();
    if (handle) focusEditor(handle.editor);
    setActiveBlockId(null);
  };

  return (
    <UploadHostContext.Provider value={api}>
      {children}
      {handle && activeBlockId !== null && <UppyFilePanel {...baseFilePanelProps} blockId={activeBlockId} editor={handle.editor} onClose={close} />}
    </UploadHostContext.Provider>
  );
}
