import {
  FilePanelExtension,
  FormattingToolbarExtension,
  SideMenuExtension,
  SuggestionMenu,
} from '@blocknote/core/extensions';
import { useExtension, useExtensionState } from '@blocknote/react';
import type { FocusEventHandler, RefObject } from 'react';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

interface UseSmartBlurArgs {
  editor: CustomBlockNoteEditor;
  /** Editor root, used to detect focus moves to a child element. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Called when the blur is "real" (not into a menu/toolbar/file panel). */
  onBlur: () => void;
}

/**
 * Returns an `onBlur` handler that ignores focus moves into BlockNote's own UI
 * (side menu, formatting toolbar, slash menu, file panel) and into descendant
 * elements of the editor container. Only invokes `onBlur` when focus actually
 * leaves the editor and its tooling.
 */
export function useSmartBlur({ editor, containerRef, onBlur }: UseSmartBlurArgs): FocusEventHandler {
  const sideMenuExt = useExtensionState(SideMenuExtension, { editor });
  const suggestionMenuExt = useExtension(SuggestionMenu, { editor });
  const formattingToolbarShown = useExtensionState(FormattingToolbarExtension, { editor });
  const filePanelShown = !!useExtensionState(FilePanelExtension, { editor });

  return (event) => {
    if (sideMenuExt?.show) return;
    if (formattingToolbarShown) return;
    if (suggestionMenuExt.shown()) return;
    if (filePanelShown) return;

    const nextFocused = event.relatedTarget;
    if (nextFocused && containerRef.current?.contains(nextFocused)) return;

    onBlur();
  };
}
