import { FilePanelExtension, FormattingToolbarExtension, SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions';
import { useExtension, useExtensionState } from '@blocknote/react';
import type { FocusEventHandler, RefObject } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

interface UseSmartBlurOptions {
  editor: CustomBlockNoteEditor;
  containerRef: RefObject<HTMLDivElement | null>;
  onBlur: () => void;
}

/** A blur handler that calls `onBlur` only when focus leaves the editor, not when it moves into BlockNote's own UI or within the container. */
export function useSmartBlur({ editor, containerRef, onBlur }: UseSmartBlurOptions): FocusEventHandler {
  const sideMenuShown = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.show ?? false });
  const suggestionMenu = useExtension(SuggestionMenu, { editor });
  const formattingToolbarShown = useExtensionState(FormattingToolbarExtension, { editor });
  const filePanelShown = !!useExtensionState(FilePanelExtension, { editor });

  return (event) => {
    if (sideMenuShown || formattingToolbarShown || suggestionMenu.shown() || filePanelShown) return;

    const nextFocused = event.relatedTarget;
    if (nextFocused && containerRef.current?.contains(nextFocused)) return;

    onBlur();
  };
}
