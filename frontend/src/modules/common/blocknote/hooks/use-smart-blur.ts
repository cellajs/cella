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
  /** Editor root for detecting focus moves to a child element. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Called when the blur is "real" (not into a menu/toolbar/file panel). */
  onBlur: () => void;
}

/**
 * Returns an `onBlur` that fires only when focus truly leaves the editor — ignoring moves into BlockNote's
 * own UI (side menu, formatting toolbar, slash menu, file panel) and descendants of the editor container.
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
