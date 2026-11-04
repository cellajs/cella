import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect } from 'storybook/test';
import { type PanelGroupApi, ResizablePanel, ResizablePanelGroup, ResizableSeparator } from '~/modules/common/resizable-panels/resizable-panels';
import { ScrollArea } from '~/modules/ui/scroll-area';

// Rule ids are those of resizable-panels.md. Real layout: jsdom measures nothing, so these cannot be unit tests.

type Layout = Record<string, number>;
type PanelSpec = string | { id: string; minWidth?: number; collapsedWidth?: number; collapsible?: boolean };

interface BoardState {
  width: number;
  panels: PanelSpec[];
  layout?: Layout;
  groupId?: string;
  /** `scroll` is a member board's ScrollArea, `clip` the public page's wrapper. */
  parent?: 'scroll' | 'clip';
  mustFit?: boolean;
  /** Renders the end handle after the last panel (E1) */
  end?: boolean;
  fit?: boolean;
}

const specId = (spec: PanelSpec) => (typeof spec === 'string' ? spec : spec.id);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// A toggle glides (T6): its widths and its collapse report land once the group drops `data-gliding`
const settle = async () => {
  await wait(100);
  while (document.querySelector('[data-gliding]')) await wait(50);
};

class Board {
  saves: Layout[] = [];
  collapses: string[] = [];
  fits: boolean[] = [];
  api?: PanelGroupApi;
  canvas?: HTMLElement;
  update?: (next: Partial<BoardState>) => void;

  constructor(readonly initial: BoardState) {}

  private get panels() {
    return [...(this.canvas?.querySelectorAll<HTMLElement>('[data-panel]') ?? [])];
  }

  private separator(index = 0) {
    const separator = this.canvas?.querySelectorAll<HTMLElement>('[role="separator"]')[index];
    if (!separator) throw new Error(`no separator ${index}`);
    separator.setPointerCapture = () => {};
    return separator;
  }

  widths() {
    return Object.fromEntries(this.panels.map((panel) => [panel.dataset.panel, Math.round(panel.getBoundingClientRect().width)]));
  }

  order() {
    return this.panels.map((panel) => panel.dataset.panel);
  }

  /** Px the panels and separators run past the board's width; negative is a gap. */
  over() {
    const separators = [...(this.canvas?.querySelectorAll<HTMLElement>('[role="separator"]') ?? [])];
    const separatorSpace = separators.reduce((sum, separator) => {
      const style = getComputedStyle(separator);
      return sum + separator.getBoundingClientRect().width + Number.parseFloat(style.marginLeft) + Number.parseFloat(style.marginRight);
    }, 0);
    const panelSum = this.panels.reduce((sum, panel) => sum + panel.getBoundingClientRect().width, 0);
    const frame = this.canvas?.querySelector<HTMLElement>('[data-frame]');
    // + 0 turns -0 into 0
    return Math.round(panelSum + separatorSpace - (frame?.getBoundingClientRect().width ?? 0)) + 0;
  }

  minWidth() {
    return this.canvas?.querySelector<HTMLElement>('.group\\/board')?.style.minWidth ?? '';
  }

  fitLine() {
    const line = this.canvas?.querySelector<HTMLElement>('[data-fit-line]');
    return !line || line.hidden ? 'hidden' : line.hasAttribute('data-snapped') ? 'solid' : 'dashed';
  }

  async set(next: Partial<BoardState>) {
    this.update?.(next);
    await settle();
    // P1: a resize saves once it settles
    if (next.width !== undefined) await settle();
  }

  async press(key: string, index = 0) {
    this.separator(index).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await settle();
  }

  pointerDown(index = 0, button = 0) {
    this.separator(index).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1000, clientY: 50, pointerId: 1, button }));
  }

  pointerMove(dx: number, pointerId = 1) {
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 1000 + dx, clientY: 50, pointerId }));
  }

  async pointerUp() {
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 1000, clientY: 50, pointerId: 1 }));
    await settle();
  }

  async drag(dx: number, index = 0) {
    this.pointerDown(index);
    this.pointerMove(dx);
    await this.pointerUp();
  }

  cancelPointer(index = 0) {
    this.separator(index).dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
  }
}

function PanelBoard({ board }: { board: Board }) {
  const [state, setState] = useState(board.initial);

  useEffect(() => {
    board.update = (next) => setState((previous) => ({ ...previous, ...next }));
  }, [board]);

  const { width, panels, layout, groupId = 'group', parent = 'scroll', mustFit, end, fit } = state;
  const group = (
    <ResizablePanelGroup
      id={groupId}
      className={parent === 'scroll' ? 'group/board h-[inherit] min-h-40' : 'group/board h-40'}
      defaultLayout={layout}
      mustFit={mustFit}
      fit={fit}
      onFitChange={(next) => {
        board.fits.push(next);
        setState((previous) => ({ ...previous, fit: next }));
      }}
      onLayoutChanged={(saved) => board.saves.push(saved)}
      onCollapseChange={(id, collapsed) => board.collapses.push(`${id}:${collapsed ? 'closed' : 'open'}`)}
      onReady={(api) => {
        board.api = api;
      }}
    >
      {panels.map((spec, index) => {
        const { minWidth = 300, collapsedWidth = 50, collapsible = true } = typeof spec === 'string' ? {} : spec;
        return (
          <div key={specId(spec)} className="relative flex shrink-0">
            <ResizablePanel id={specId(spec)} minWidth={minWidth} collapsedWidth={collapsedWidth} collapsible={collapsible} label={specId(spec)} />
            {(index < panels.length - 1 || end) && <ResizableSeparator index={index} className="mx-[0.02rem] w-1.5 bg-border" />}
          </div>
        );
      })}
    </ResizablePanelGroup>
  );

  return (
    <div data-frame style={{ width, height: 200 }} className={parent === 'clip' ? 'overflow-x-clip' : undefined}>
      {parent === 'scroll' ? (
        <ScrollArea className="h-[200px]" viewportClassName="overflow-y-hidden! overscroll-x-contain overscroll-y-auto" horizontalScroll>
          {group}
        </ScrollArea>
      ) : (
        group
      )}
    </div>
  );
}

const meta: Meta = {
  title: 'Common/ResizablePanels',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

function scenario(initial: BoardState, play: (board: Board) => Promise<void>): Story {
  const board = new Board(initial);
  return {
    render: () => <PanelBoard board={board} />,
    play: async ({ canvasElement }) => {
      board.canvas = canvasElement;
      await settle();
      await play(board);
    },
  };
}

const wide = { a: 600, b: 593.36 };

export const FirstMountFills = scenario({ width: 1000, panels: ['a', 'b'] }, async (board) => {
  await expect(board.widths()).toEqual({ a: 497, b: 497 });
  await expect(board.saves).toHaveLength(1);
  await expect(board.collapses).toEqual(['a:open', 'b:open']);
});

export const FirstMountStoredCollapse = scenario({ width: 1000, panels: ['a', 'b'], layout: { a: 300, b: 50 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 943, b: 50 });
  await expect(board.collapses).toEqual(['a:open', 'b:closed']);
});

export const OverflowBelowIdealWidth = scenario({ width: 700, panels: ['a', 'b'], layout: { a: 300, b: 300 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 375, b: 375 });
  await expect(board.minWidth()).toBe('757px');
});

export const OverflowKeepsWiderWidths = scenario({ width: 700, panels: ['a', 'b'], layout: { a: 500, b: 500 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 500, b: 500 });
  await expect(board.minWidth()).toBe('1007px');
  await expect(board.saves).toHaveLength(0);
});

export const AddPanelRefits = scenario({ width: 1200, panels: ['a'], layout: { a: 1200, b: 300 } }, async (board) => {
  await board.set({ panels: ['a', 'b'] });
  await expect(board.widths()).toEqual({ a: 893, b: 300 });
  await expect(board.over()).toBe(0);
});

export const AddPanelRefitsClipped = scenario({ width: 1200, panels: ['a'], layout: { a: 1200, b: 300 }, parent: 'clip' }, async (board) => {
  await board.set({ panels: ['a', 'b'] });
  await expect(board.widths()).toEqual({ a: 893, b: 300 });
  await expect(board.over()).toBe(0);
});

export const AddClosedPanelRefits = scenario({ width: 1200, panels: ['a'], layout: { a: 1200, b: 50 } }, async (board) => {
  await board.set({ panels: ['a', 'b'] });
  await expect(board.widths()).toEqual({ a: 1143, b: 50 });
});

export const AddPanelCrossesIntoOverflow = scenario({ width: 1000, panels: ['a', 'b'], layout: { a: 496, b: 497.36, c: 300 } }, async (board) => {
  await board.set({ panels: ['a', 'b', 'c'] });
  await expect(board.widths()).toEqual({ a: 496, b: 497, c: 300 });
  await expect(board.minWidth()).toBe('1307px');
});

export const RemovePanelFillsTheRoom = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  await board.set({ panels: ['a'] });
  await expect(board.widths()).toEqual({ a: 1200 });
});

export const RemovePanelClearsMinWidth = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: { a: 400, b: 400, c: 400 } }, async (board) => {
  await expect(board.minWidth()).toBe('1214px');
  await board.set({ panels: ['a', 'b'] });
  await expect(board.widths()).toEqual({ a: 497, b: 497 });
  await expect(board.minWidth()).toBe('');
});

export const ReorderKeepsWidths = scenario({ width: 1200, panels: ['a', 'b', 'c'], layout: { a: 400, b: 400, c: 386.72 } }, async (board) => {
  await board.set({ panels: ['c', 'a', 'b'] });
  await expect(board.order()).toEqual(['c', 'a', 'b']);
  await expect(board.widths()).toEqual({ c: 387, a: 400, b: 400 });
  await expect(board.saves).toHaveLength(0);
});

export const NewGroupIdRereadsLayout = scenario({ width: 1200, panels: ['a', 'b'], layout: { a: 800, b: 393.36 } }, async (board) => {
  await board.set({ groupId: 'other', layout: { a: 400, b: 793.36 } });
  await expect(board.widths()).toEqual({ a: 400, b: 793 });
  await board.set({ layout: { a: 900, b: 293.36 } });
  await expect(board.widths()).toEqual({ a: 400, b: 793 });
});

export const PanelChangeAbortsDrag = scenario({ width: 1200, panels: ['a', 'b'], layout: { ...wide, c: 300 } }, async (board) => {
  board.pointerDown();
  board.pointerMove(-100);
  await expect(board.widths()).toEqual({ a: 500, b: 693 });
  await board.set({ panels: ['a', 'b', 'c'] });
  await expect(board.widths()).toEqual({ a: 446, b: 441, c: 300 });
  board.pointerMove(-200);
  await expect(board.widths()).toEqual({ a: 446, b: 441, c: 300 });
  await board.pointerUp();
  await expect(board.saves).toHaveLength(1);
});

export const RefitScalesInProportion = scenario({ width: 2000, panels: ['a', 'b'], layout: { a: 1000, b: 993.36 } }, async (board) => {
  await board.set({ width: 1600 });
  await expect(board.widths()).toEqual({ a: 799, b: 794 });
  await expect(board.saves).toHaveLength(1);
});

export const RefitCrossesTheModeThreshold = scenario({ width: 760, panels: ['a', 'b'], layout: { a: 376, b: 377.36 } }, async (board) => {
  await board.set({ width: 750 });
  await expect(board.minWidth()).toBe('760px');
  await board.set({ width: 1000 });
  await expect(board.minWidth()).toBe('');
  await expect(board.widths()).toEqual({ a: 496, b: 498 });
});

export const RefitPaysForAPanelAtMin = scenario({ width: 1000, panels: ['a', 'b'], layout: { a: 900, b: 300 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 693, b: 300 });
  await expect(board.over()).toBe(0);
});

export const RefitTakesBackEveryPixel = scenario({ width: 1500, panels: ['a', 'b'], layout: { a: 750, b: 750 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 747, b: 747 });
  await expect(board.over()).toBe(0);
  await expect(board.saves).toHaveLength(1);
});

export const RefitKeepsProportionsThroughAResize = scenario(
  { width: 1300, panels: ['a', 'b', 'c'], layout: { a: 400, b: 500, c: 386.72 } },
  async (board) => {
    for (let width = 1293; width >= 1200; width -= 7) await board.set({ width });
    await expect(board.over()).toBe(0);
    await board.set({ width: 1300 });
    await expect(board.widths()).toEqual({ a: 400, b: 500, c: 387 });
  },
);

export const RefitHasNoMemory = scenario({ width: 1600, panels: ['a', 'b'], layout: { a: 300, b: 1293.36 } }, async (board) => {
  await board.set({ width: 700 });
  await expect(board.widths()).toEqual({ a: 481, b: 693 });
  await expect(board.minWidth()).toBe('1182px');
  await board.set({ width: 1600 });
  await expect(board.widths()).toEqual({ a: 653, b: 941 });
  await expect(board.saves).toHaveLength(2);
});

export const ResizeDuringDragWaitsForDrop = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.pointerDown();
  board.pointerMove(-50);
  await board.set({ width: 1000 });
  await expect(board.widths()).toEqual({ a: 550, b: 643 });
  await board.pointerUp();
  await expect(board.widths()).toEqual({ a: 458, b: 536 });
});

export const ToggleClosesAndReopensScaled = scenario({ width: 1200, panels: ['a', 'b'], layout: { a: 800, b: 393.36 } }, async (board) => {
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths()).toEqual({ a: 1143, b: 50 });
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths()).toEqual({ a: 888, b: 305 });
  await expect(board.saves).toHaveLength(2);
  board.api?.expandPanel('a');
  await settle();
  await expect(board.saves).toHaveLength(2);
});

export const ToggleIntoNoRoomGoesToOverflow = scenario({ width: 500, panels: ['a', 'b'], layout: { a: 50, b: 443.36 } }, async (board) => {
  board.api?.togglePanel('a');
  await settle();
  await expect(board.minWidth()).toBe('757px');
  await expect(board.widths().a).toBeGreaterThanOrEqual(300);
  await expect(board.widths().b).toBe(448);
});

export const AllClosedIsAllowed = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.api?.togglePanel('a');
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths()).toEqual({ a: 50, b: 50 });
  await expect(board.minWidth()).toBe('');
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths()).toEqual({ a: 50, b: 1143 });
});

export const EnterTogglesLeftPanel = scenario({ width: 1200, panels: ['a', 'b', 'c'], layout: { a: 400, b: 400, c: 386.72 } }, async (board) => {
  await board.press('Enter');
  await expect(board.widths()).toEqual({ a: 50, b: 578, c: 559 });
  await board.press('Enter');
  await expect(board.widths().a).toBeGreaterThan(50);
});

export const PressWithoutMovingSaves = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  await board.drag(0);
  await expect(board.widths()).toEqual({ a: 600, b: 593 });
  await expect(board.saves).toHaveLength(1);
});

export const DragReleasedInTheZoneStaysAtMin = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.pointerDown();
  board.pointerMove(450);
  await expect(board.widths()).toEqual({ a: 1143, b: 50 });
  board.pointerMove(200);
  await expect(board.widths()).toEqual({ a: 800, b: 393 });
  board.pointerMove(310);
  await expect(board.widths()).toEqual({ a: 893, b: 300 });
  await board.pointerUp();
  await expect(board.widths()).toEqual({ a: 893, b: 300 });
});

export const DragOpensWithoutFundingThenOverflows = scenario({ width: 500, panels: ['a', 'b'], layout: { a: 443.36, b: 50 } }, async (board) => {
  board.pointerDown();
  board.pointerMove(-260);
  await expect(board.widths()).toEqual({ a: 300, b: 300 });
  await expect(board.over()).toBe(107);
  await board.pointerUp();
  await expect(board.widths()).toEqual({ a: 375, b: 375 });
  await expect(board.minWidth()).toBe('757px');
});

export const ArrowsMoveBetweenPanels = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  await board.press('ArrowRight');
  await expect(board.widths()).toEqual({ a: 620, b: 573 });
  await board.press('ArrowLeft');
  await expect(board.widths()).toEqual({ a: 600, b: 593 });
});

export const HomeAndEndCloseInOnePress = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  await board.press('End');
  await expect(board.widths()).toEqual({ a: 1143, b: 50 });
  await board.press('Home');
  await expect(board.widths()).toEqual({ a: 50, b: 1143 });
});

export const ClosedVictimBlocksTheKey = scenario({ width: 1200, panels: ['a', 'b', 'c'], layout: { a: 50, b: 50, c: 1086.72 } }, async (board) => {
  await board.press('ArrowRight');
  await expect(board.widths()).toEqual({ a: 50, b: 50, c: 1087 });
  await expect(board.saves).toHaveLength(1);
  await board.press('ArrowRight', 1);
  await expect(board.widths()).toEqual({ a: 50, b: 300, c: 837 });
});

export const ArrowOpensClosedGrower = scenario({ width: 640, panels: ['a', 'b'], layout: { a: 583.36, b: 50 } }, async (board) => {
  await board.press('ArrowLeft');
  await expect(board.widths()).toEqual({ a: 563, b: 300 });
  await expect(board.minWidth()).toBe('870px');
});

export const ArrowOpensClosedGrowerWithVictimAtMin = scenario(
  { width: 1364, panels: ['a', 'b', 'c'], layout: { a: 300, b: 50, c: 1000.72 } },
  async (board) => {
    await board.press('ArrowLeft');
    await expect(board.widths()).toEqual({ a: 300, b: 300, c: 751 });
  },
);

export const ArrowStopsAtMin = scenario({ width: 706, panels: ['a', 'b'], layout: { a: 400, b: 300 } }, async (board) => {
  await expect(board.widths()).toEqual({ a: 429, b: 322 });
  await board.press('ArrowRight');
  await board.press('ArrowRight');
  await expect(board.widths()).toEqual({ a: 450, b: 300 });
});

export const ArrowGrowerIsUncappedInOverflow = scenario(
  { width: 1000, panels: ['a', 'b', 'c'], layout: { a: 600, b: 400, c: 300 } },
  async (board) => {
    await board.press('ArrowRight');
    await expect(board.widths()).toEqual({ a: 620, b: 380, c: 300 });
  },
);

export const CancelledPointerAbortsDrag = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.pointerDown();
  board.pointerMove(-20);
  board.cancelPointer();
  board.pointerMove(-120);
  await expect(board.widths()).toEqual({ a: 600, b: 593 });
  await board.pointerUp();
  await expect(board.saves).toHaveLength(0);
});

export const OtherPointerIsIgnored = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.pointerDown();
  board.pointerMove(-100, 2);
  await expect(board.widths()).toEqual({ a: 600, b: 593 });
  board.pointerMove(-50);
  await expect(board.widths()).toEqual({ a: 550, b: 643 });
  await board.pointerUp();
});

export const SecondaryButtonIsIgnored = scenario({ width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  board.pointerDown(0, 2);
  board.pointerMove(-100);
  await expect(board.widths()).toEqual({ a: 600, b: 593 });
  await board.pointerUp();
});

export const NonCollapsiblePanelHoldsItsMin = scenario(
  { width: 1200, panels: ['a', { id: 'b', collapsible: false }], layout: wide },
  async (board) => {
    await board.drag(800);
    await expect(board.widths()).toEqual({ a: 893, b: 300 });
    board.api?.togglePanel('b');
    await settle();
    await expect(board.widths()).toEqual({ a: 893, b: 300 });
    await board.press('End');
    await expect(board.widths()).toEqual({ a: 893, b: 300 });
  },
);

export const MixedSizesFit = scenario(
  {
    width: 1000,
    panels: [
      { id: 'a', minWidth: 200, collapsedWidth: 40 },
      { id: 'b', minWidth: 500, collapsedWidth: 60 },
    ],
    layout: { a: 400, b: 400 },
  },
  async (board) => {
    await expect(board.widths()).toEqual({ a: 493, b: 500 });
    await expect(board.over()).toBe(0);
  },
);

const fitting = { mustFit: true, parent: 'clip' } as const;
const four = ['a', 'b', 'c', 'd'];

export const FitSharesTheRow = scenario({ ...fitting, width: 1256, panels: four }, async (board) => {
  await expect(board.widths()).toEqual({ a: 309, b: 309, c: 309, d: 309 });
  await expect(board.over()).toBe(0);
  await expect(board.minWidth()).toBe('');
  await expect(board.saves).toHaveLength(0);
});

export const FitGoesBelowTheIdealWidth = scenario({ ...fitting, width: 700, panels: ['a', 'b'] }, async (board) => {
  await expect(board.widths()).toEqual({ a: 347, b: 347 });
  await expect(board.minWidth()).toBe('');
});

export const FitClosesTheRightmost = scenario({ ...fitting, width: 1000, panels: four }, async (board) => {
  await expect(board.widths()).toEqual({ a: 310, b: 310, c: 310, d: 50 });
  await expect(board.over()).toBe(0);
  await expect(board.collapses).toContain('d:closed');
});

export const FitWorksInAScrollArea = scenario({ mustFit: true, width: 1000, panels: four }, async (board) => {
  await expect(board.widths()).toEqual({ a: 310, b: 310, c: 310, d: 50 });
  await expect(board.over()).toBe(0);
});

export const FitReopensWhenRoomReturns = scenario({ ...fitting, width: 1000, panels: four }, async (board) => {
  await board.set({ width: 1256 });
  await expect(board.widths()).toEqual({ a: 309, b: 309, c: 309, d: 309 });
  await expect(board.collapses).toContain('d:open');
  await expect(board.saves).toHaveLength(0);
});

export const FitRestoresWidthsAfterNarrowing = scenario(
  { ...fitting, width: 1600, panels: ['a', 'b'], layout: { a: 300, b: 1294 } },
  async (board) => {
    const before = board.widths();
    await board.set({ width: 700 });
    await expect(board.over()).toBe(0);
    await board.set({ width: 1600 });
    await expect(board.widths()).toEqual(before);
    await expect(board.saves).toHaveLength(0);
  },
);

export const FitAddedPanelStaysOpen = scenario({ ...fitting, width: 1000, panels: ['a', 'b', 'c'] }, async (board) => {
  await board.set({ panels: four });
  await expect(board.widths()).toEqual({ a: 310, b: 310, c: 50, d: 310 });
  await expect(board.over()).toBe(0);
  await expect(board.saves).toHaveLength(0);
});

export const FitRemovedPanelFreesARoom = scenario({ ...fitting, width: 1000, panels: four }, async (board) => {
  await board.set({ panels: ['a', 'b', 'd'] });
  await expect(board.widths()).toEqual({ a: 329, b: 329, d: 329 });
  await board.set({ panels: ['a', 'b', 'c', 'd'] });
  await expect(board.over()).toBe(0);
});

export const FitOpeningAStripClosesAnother = scenario({ ...fitting, width: 1000, panels: four }, async (board) => {
  board.api?.expandPanel('d');
  await settle();
  await expect(board.widths()).toEqual({ a: 310, b: 310, c: 50, d: 310 });
  await expect(board.over()).toBe(0);
  await expect(board.saves).toHaveLength(1);
});

export const FitUserCloseStaysThroughResize = scenario({ ...fitting, width: 1256, panels: four }, async (board) => {
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths().b).toBe(50);
  await board.set({ width: 800 });
  await board.set({ width: 1600 });
  await expect(board.widths().b).toBe(50);
  await expect(board.widths().d).toBeGreaterThan(300);
});

export const FitOneStaysOpen = scenario({ ...fitting, width: 1000, panels: ['a', 'b'] }, async (board) => {
  board.api?.togglePanel('a');
  await settle();
  await expect(board.widths()).toEqual({ a: 50, b: 943 });
  board.api?.togglePanel('b');
  await settle();
  await expect(board.widths()).toEqual({ a: 50, b: 943 });
});

export const FitDragHoldsThenSwaps = scenario({ ...fitting, width: 500, panels: ['a', 'b'], layout: { a: 443.36, b: 50 } }, async (board) => {
  board.pointerDown();
  board.pointerMove(-200);
  await expect(board.widths()).toEqual({ a: 443, b: 50 });
  board.pointerMove(-400);
  await expect(board.widths()).toEqual({ a: 50, b: 443 });
  await expect(board.over()).toBe(0);
  await board.pointerUp();
  await expect(board.widths()).toEqual({ a: 50, b: 443 });
  await expect(board.saves).toHaveLength(1);
});

export const FitDragAndKeySave = scenario({ ...fitting, width: 1200, panels: ['a', 'b'], layout: wide }, async (board) => {
  await board.drag(0);
  await expect(board.saves).toHaveLength(0);
  await board.drag(-100);
  await expect(board.widths()).toEqual({ a: 500, b: 693 });
  await expect(board.saves).toHaveLength(1);
  await board.press('ArrowLeft');
  await expect(board.widths()).toEqual({ a: 480, b: 713 });
  await expect(board.saves).toHaveLength(2);
});

export const FitArrowOpensAStripAndClosesAnother = scenario(
  { ...fitting, width: 500, panels: ['a', 'b'], layout: { a: 443.36, b: 50 } },
  async (board) => {
    await board.press('ArrowLeft');
    await expect(board.widths().a).toBe(50);
    await expect(board.widths().b).toBe(443);
    await expect(board.over()).toBe(0);
  },
);

// Three open panels at 375 with the end handle: the ideal of 1125 plus three separators overflows 1000, at 300 each the row fits
const roomy = { a: 375, b: 375, c: 375 };

export const EndDragToTheLineFits = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true }, async (board) => {
  await expect(board.minWidth()).toBe('1145px');
  board.pointerDown(2);
  board.pointerMove(-60);
  await expect(board.fitLine()).toBe('dashed');
  await expect(board.widths()).toEqual({ a: 375, b: 375, c: 315 });
  board.pointerMove(-150);
  await expect(board.fitLine()).toBe('solid');
  await board.pointerUp();
  await expect(board.fitLine()).toBe('hidden');
  await expect(board.fits).toEqual([true]);
  await expect(board.minWidth()).toBe('');
  await expect(board.widths()).toEqual({ a: 327, b: 327, c: 327 });
  await expect(board.over()).toBe(0);
});

export const EndReleasedShortChangesNothing = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true }, async (board) => {
  await board.drag(-60, 2);
  await expect(board.fits).toEqual([]);
  await expect(board.widths()).toEqual(roomy);
  await expect(board.minWidth()).toBe('1145px');
});

export const EndFitsAtMinWhenTheRoomIsShort = scenario({ width: 800, panels: ['a', 'b', 'c'], layout: roomy, end: true }, async (board) => {
  await board.drag(-400, 2);
  await expect(board.fits).toEqual([true]);
  await expect(board.widths()).toEqual({ a: 300, b: 300, c: 300 });
  await expect(board.minWidth()).toBe('920px');
});

export const EndPullPastTheGateGoesRoomy = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true, fit: true }, async (board) => {
  await expect(board.widths()).toEqual({ a: 327, b: 327, c: 327 });
  await board.drag(30, 2);
  await expect(board.fits).toEqual([]);
  await expect(board.minWidth()).toBe('');
  await board.drag(60, 2);
  await expect(board.fits).toEqual([false]);
  await expect(board.minWidth()).toBe('1145px');
  await expect(board.widths()).toEqual(roomy);
});

export const EndKeysSwitchFit = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true }, async (board) => {
  await board.press('Home', 2);
  await expect(board.fits).toEqual([true]);
  await expect(board.minWidth()).toBe('');
  await board.press('End', 2);
  await expect(board.fits).toEqual([true, false]);
  await expect(board.minWidth()).toBe('1145px');
});

export const EndFitFromTheConsumerApplies = scenario({ width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true }, async (board) => {
  await board.set({ fit: true });
  await expect(board.fits).toEqual([]);
  await expect(board.widths()).toEqual({ a: 327, b: 327, c: 327 });
  await expect(board.minWidth()).toBe('');
});

export const EndFitKeepsTheRowNarrowOnResize = scenario(
  { width: 1000, panels: ['a', 'b', 'c'], layout: roomy, end: true, fit: true },
  async (board) => {
    await board.set({ width: 960 });
    await expect(board.minWidth()).toBe('');
    await expect(board.widths()).toEqual({ a: 313, b: 313, c: 313 });
    for (const width of [940, 920, 900]) await board.set({ width });
    await expect(board.minWidth()).toBe('920px');
    await expect(board.widths()).toEqual({ a: 300, b: 300, c: 300 });
  },
);
