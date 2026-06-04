import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardStore } from './board-store';

describe('board-store panel orders', () => {
  beforeEach(() => {
    useBoardStore.setState({
      panelCollapseState: {},
      activeBoardId: null,
      activeBoardType: null,
      activePanelId: null,
      boardLayouts: {},
      boardPanelOrders: {},
    });
  });

  it('records and updates local panel displayOrder', () => {
    const boardId = 'board-1';
    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    useBoardStore.getState().setPanelOrder(boardId, 'ai-chat', 200);

    expect(useBoardStore.getState().boardPanelOrders[boardId]).toEqual({
      explainer: 100,
      'ai-chat': 200,
    });

    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 150);
    expect(useBoardStore.getState().boardPanelOrders[boardId]).toEqual({
      explainer: 150,
      'ai-chat': 200,
    });
  });

  it('does not rewrite state when displayOrder is unchanged', () => {
    const boardId = 'board-2';
    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    const previousRef = useBoardStore.getState().boardPanelOrders[boardId];

    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 100);

    expect(useBoardStore.getState().boardPanelOrders[boardId]).toBe(previousRef);
  });

  it('prunes orders for panels that no longer exist', () => {
    const boardId = 'board-3';
    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    useBoardStore.getState().setPanelOrder(boardId, 'ai-chat', 200);
    useBoardStore.getState().setPanelOrder(boardId, 'gone', 300);

    useBoardStore.getState().prunePanelOrders(boardId, ['explainer', 'ai-chat']);

    expect(useBoardStore.getState().boardPanelOrders[boardId]).toEqual({
      explainer: 100,
      'ai-chat': 200,
    });
  });

  it('is a no-op when nothing is stale', () => {
    const boardId = 'board-4';
    useBoardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    const previousRef = useBoardStore.getState().boardPanelOrders[boardId];

    useBoardStore.getState().prunePanelOrders(boardId, ['explainer']);

    expect(useBoardStore.getState().boardPanelOrders[boardId]).toBe(previousRef);
  });
});
