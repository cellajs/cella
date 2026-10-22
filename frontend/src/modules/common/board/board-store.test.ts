import { beforeEach, describe, expect, it } from 'vitest';
import { boardStore } from './board-store';

describe('board-store panel orders', () => {
  beforeEach(() => {
    boardStore.setState({
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
    boardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    boardStore.getState().setPanelOrder(boardId, 'ai-chat', 200);

    expect(boardStore.getState().boardPanelOrders[boardId]).toEqual({ explainer: 100, 'ai-chat': 200 });

    boardStore.getState().setPanelOrder(boardId, 'explainer', 150);
    expect(boardStore.getState().boardPanelOrders[boardId]).toEqual({ explainer: 150, 'ai-chat': 200 });
  });

  it('does not rewrite state when displayOrder is unchanged', () => {
    const boardId = 'board-2';
    boardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    const previousRef = boardStore.getState().boardPanelOrders[boardId];

    boardStore.getState().setPanelOrder(boardId, 'explainer', 100);

    expect(boardStore.getState().boardPanelOrders[boardId]).toBe(previousRef);
  });

  it('prunes orders for panels that no longer exist', () => {
    const boardId = 'board-3';
    boardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    boardStore.getState().setPanelOrder(boardId, 'ai-chat', 200);
    boardStore.getState().setPanelOrder(boardId, 'gone', 300);

    boardStore.getState().prunePanelOrders(boardId, ['explainer', 'ai-chat']);

    expect(boardStore.getState().boardPanelOrders[boardId]).toEqual({ explainer: 100, 'ai-chat': 200 });
  });

  it('is a no-op when nothing is stale', () => {
    const boardId = 'board-4';
    boardStore.getState().setPanelOrder(boardId, 'explainer', 100);
    const previousRef = boardStore.getState().boardPanelOrders[boardId];

    boardStore.getState().prunePanelOrders(boardId, ['explainer']);

    expect(boardStore.getState().boardPanelOrders[boardId]).toBe(previousRef);
  });
});
