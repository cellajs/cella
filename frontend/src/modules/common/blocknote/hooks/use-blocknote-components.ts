import { useComponentsContext } from '@blocknote/react';

/** BlockNote's UI components, which exist only inside the editor's view; throws outside it. */
export function useBlockNoteComponents() {
  const components = useComponentsContext();
  if (!components) throw new Error('useBlockNoteComponents must be used inside a BlockNote view');
  return components;
}
