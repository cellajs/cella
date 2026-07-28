import { createContext, type ReactNode, useContext, useRef, useState } from 'react';
import { appConfig } from 'shared';
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

/** Read the surrounding upload host, if the editor is wrapped in one. */
export const useUploadHost = () => useContext(UploadHostContext);

/**
 * Owns the Uppy upload dialog outside the editor's React subtree, so a mid-upload editor remount (e.g.
 * a Yjs solo→collab switch) can no longer tear down an open dialog or discard an already picked file.
 * A `FilePanelBridge` inside the editor feeds it the active block and the live editor.
 */
export function UploadHostProvider({
  baseFilePanelProps,
  children,
}: {
  baseFilePanelProps: BaseUppyFilePanelProps;
  children: ReactNode;
}) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [handle, setHandle] = useState<EditorHandle | null>(null);

  // Stable API object: the setters are referentially stable, so the bridge's effects never re-run on it.
  const api = useRef<UploadHostApi>({ openFor: setActiveBlockId, registerEditor: setHandle }).current;

  const close = () => {
    handle?.closeFilePanel();
    if (handle) focusEditor(handle.editor);
    setActiveBlockId(null);
  };

  return (
    <UploadHostContext.Provider value={api}>
      {children}
      {appConfig.has.uploadEnabled && handle && activeBlockId !== null && (
        <UppyFilePanel {...baseFilePanelProps} blockId={activeBlockId} editor={handle.editor} onClose={close} />
      )}
    </UploadHostContext.Provider>
  );
}
