import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './board-store';

describe('board-store panel order sync', () => {
  beforeEach(() => {
    useBoardStore.setState({
      panelCollapseState: {},
      activeBoardId: null,
      activeBoardType: null,
      activePanelId: null,
      boardLayouts: {},
      boardPanelOrder: {},
    });
  });

  it('removes stale panel ids and appends new observed ids', () => {
    const boardId = 'board-1';
    useBoardStore.getState().updatePanelOrder(boardId, ['explainer', 'project-a', 'project-c']);

    const resolved = useBoardStore.getState().syncBoardPanelOrder(boardId, ['explainer', 'project-a', 'project-b']);

    expect(resolved).toEqual(['explainer', 'project-a', 'project-b']);
    expect(useBoardStore.getState().boardPanelOrder[boardId]).toEqual(['explainer', 'project-a', 'project-b']);
  });

  it('does not rewrite state when order is already in sync', () => {
    const boardId = 'board-2';
    useBoardStore.getState().updatePanelOrder(boardId, ['explainer', 'project-a']);

    const previousRef = useBoardStore.getState().boardPanelOrder[boardId];
    const resolved = useBoardStore.getState().syncBoardPanelOrder(boardId, ['explainer', 'project-a']);

    expect(resolved).toBe(previousRef);
    expect(useBoardStore.getState().boardPanelOrder[boardId]).toBe(previousRef);
  });

  it('initializes board order from observed ids when no prior order exists', () => {
    const boardId = 'board-3';

    const resolved = useBoardStore.getState().syncBoardPanelOrder(boardId, ['explainer', 'project-a', 'ai-chat']);

    expect(resolved).toEqual(['explainer', 'project-a', 'ai-chat']);
    expect(useBoardStore.getState().boardPanelOrder[boardId]).toEqual(['explainer', 'project-a', 'ai-chat']);
  });
});
