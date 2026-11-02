import { describe, expect, it } from 'vitest';
import { type DragState, distributeWidths, fitPanels, type PanelConfig, resolveLayout } from '~/modules/common/resizable-panels/panel-layout';

const panel = (id: string, overrides: Partial<PanelConfig> = {}): PanelConfig => ({
  id,
  minWidth: 300,
  collapsedWidth: 50,
  collapsible: true,
  ...overrides,
});

const dragOf = (widths: Record<string, number>, separatorIndex: number, autoFill = true): DragState => ({
  separatorIndex,
  startX: 0,
  autoFill,
  initialWidths: widths,
  collapsedAtStart: new Set(Object.keys(widths).filter((id) => widths[id] <= 50)),
});

const resolve = (widths: Record<string, number>, separatorIndex: number, dx: number, autoFill = true) =>
  resolveLayout(
    Object.keys(widths).map((id) => panel(id)),
    dragOf(widths, separatorIndex, autoFill),
    dx,
  );

describe('distributeWidths', () => {
  it('R1: shares in proportion and fills exactly', () => {
    expect(distributeWidths([panel('a'), panel('b')], { a: 1000, b: 500 }, 1200)).toEqual({ a: 800, b: 400 });
    expect(distributeWidths([panel('a'), panel('b')], { a: 500, b: 500 }, 1001)).toEqual({ a: 500, b: 501 });
  });

  it('R1: a panel a share would take below min holds it, and the others pay', () => {
    expect(distributeWidths([panel('a'), panel('b')], { a: 900, b: 300 }, 993)).toEqual({ a: 693, b: 300 });
  });

  it('R1: holding one can take another below min, so it repeats', () => {
    expect(distributeWidths([panel('a'), panel('b'), panel('c')], { a: 300, b: 400, c: 2000 }, 1000)).toEqual({ a: 300, b: 300, c: 400 });
  });

  it('R1: a row refitted to its own widths stays as it is', () => {
    const row = [panel('a'), panel('b')];
    const once = distributeWidths(row, { a: 600, b: 593.36 }, 1193.36);
    expect(once.a).toBe(600);
    expect(once.b).toBeCloseTo(593.36);
    expect(distributeWidths(row, once, 1193.36)).toEqual(once);
  });

  it('ends at min when the room is too small, which overflow then scrolls', () => {
    expect(distributeWidths([panel('a'), panel('b')], { a: 500, b: 500 }, 400)).toEqual({ a: 300, b: 300 });
  });
});

describe('resolveLayout', () => {
  it('leaves everything in place without a delta', () => {
    expect(resolve({ a: 400, b: 400 }, 0, 0)).toEqual({ widths: { a: 400, b: 400 }, hints: [] });
  });

  it('G1: the panel the separator moves away from grows', () => {
    expect(resolve({ a: 500, b: 500 }, 0, 100).widths).toEqual({ a: 600, b: 400 });
    expect(resolve({ a: 500, b: 500 }, 0, -100).widths).toEqual({ a: 400, b: 600 });
  });

  describe('G2: collapse snap', () => {
    it('freezes at minWidth through the zone and hints its progress', () => {
      const { widths, hints } = resolve({ a: 450, b: 350 }, 0, 100);
      expect(widths).toEqual({ a: 500, b: 300 });
      expect(hints[0]).toMatchObject({ panelId: 'b', mode: 'collapse', side: 'left' });
      expect(hints[0].progress).toBeGreaterThan(0);
    });

    it('snaps past the snap point, the md example', () => {
      expect(resolve({ a: 450, b: 350 }, 0, 250).widths).toEqual({ a: 750, b: 50 });
    });

    it('reverses when dragged back', () => {
      expect(resolve({ a: 450, b: 350 }, 0, 40).widths).toEqual({ a: 490, b: 310 });
    });
  });

  describe('G3: expand gate', () => {
    it('holds the layout and hints the neighbour until the full distance', () => {
      const { widths, hints } = resolve({ a: 500, b: 50 }, 0, -249);
      expect(widths).toEqual({ a: 500, b: 50 });
      expect(hints.map(({ panelId, mode }) => [panelId, mode])).toEqual([
        ['b', 'expand'],
        ['a', 'cover'],
      ]);
    });

    it('snaps to minWidth at the full distance, the md example', () => {
      expect(resolve({ a: 500, b: 50 }, 0, -250).widths).toEqual({ a: 300, b: 300 });
    });
  });

  describe('G9: two-phase cascade', () => {
    it('shrinks every victim to min before anything collapses, the md example', () => {
      expect(resolve({ a: 350, b: 350, c: 500 }, 0, 200).widths).toEqual({ a: 550, b: 300, c: 350 });
    });

    it('then collapses nearest first', () => {
      expect(resolve({ a: 350, b: 350, c: 500 }, 0, 2000).widths).toEqual({ a: 1100, b: 50, c: 50 });
    });

    it('skips panels collapsed at the start, the md example', () => {
      expect(resolve({ a: 400, b: 50, c: 300, d: 350 }, 2, -2000).widths).toEqual({ a: 50, b: 50, c: 50, d: 950 });
    });

    it('leaves a non-collapsible victim at min', () => {
      const panels = [panel('a'), panel('b', { collapsible: false })];
      expect(resolveLayout(panels, dragOf({ a: 600, b: 400 }, 0), 2000).widths).toEqual({ a: 700, b: 300 });
    });
  });

  it('autoFill: a collapsed victim funds the grower, the md example', () => {
    expect(resolve({ a: 400, b: 300, c: 300 }, 0, 200).widths).toEqual({ a: 650, b: 50, c: 300 });
  });

  describe('G10: no swap', () => {
    it('opens the grower over budget when victims cannot fund it, the md example', () => {
      expect(resolve({ a: 443, b: 50 }, 0, -260).widths).toEqual({ a: 300, b: 300 });
    });

    it('lets the direct victim collapse once funded', () => {
      expect(resolve({ a: 700, b: 50 }, 0, -800).widths).toEqual({ a: 50, b: 700 });
    });
  });

  it('O2: overflow opens for free and victims only pay the rest, the md example', () => {
    expect(resolve({ a: 450, b: 500, c: 50 }, 1, -350, false).widths).toEqual({ a: 450, b: 400, c: 400 });
  });

  describe('invariants over random layouts', () => {
    let seed = 7;
    const random = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % limit;
    };
    const total = (widths: Record<string, number>) => Object.values(widths).reduce((sum, width) => sum + width, 0);

    it('never leaves a width between collapsed and min, and keeps the total unless a collapsed grower opens', () => {
      for (let run = 0; run < 20_000; run++) {
        const count = 2 + random(4);
        const widths = Object.fromEntries(Array.from({ length: count }, (_, i) => [`panel${i}`, random(3) === 0 ? 50 : 300 + random(5) * 50]));
        const separatorIndex = random(count - 1);
        const dx = (random(2) ? 1 : -1) * (1 + random(1500));
        const result = resolve(widths, separatorIndex, dx).widths;

        for (const width of Object.values(result)) expect(width === 50 || width >= 300).toBe(true);

        const growerId = `panel${dx < 0 ? separatorIndex + 1 : separatorIndex}`;
        if (widths[growerId] > 50) expect(total(result)).toBe(total(widths));
        else expect(total(result)).toBeGreaterThanOrEqual(total(widths));
      }
    });
  });
});

describe('resolveLayout in must-fit', () => {
  const resolveFit = (widths: Record<string, number>, separatorIndex: number, dx: number) =>
    resolveLayout(
      Object.keys(widths).map((id) => panel(id)),
      { ...dragOf(widths, separatorIndex), mustFit: true },
      dx,
    );

  it('F7: swaps once the direct victim can pay', () => {
    expect(resolveFit({ a: 443, b: 50 }, 0, -400).widths).toEqual({ a: 50, b: 443 });
  });

  it('F7: holds the gate until then, its hint full', () => {
    const { widths, hints } = resolveFit({ a: 443, b: 50 }, 0, -260);
    expect(widths).toEqual({ a: 443, b: 50 });
    expect(hints).toContainEqual({ panelId: 'b', side: 'left', mode: 'expand', progress: 1, reach: 0 });
  });

  it('F7: holds for good with nothing to take from', () => {
    expect(resolveFit({ a: 50, b: 50 }, 0, 900).widths).toEqual({ a: 50, b: 50 });
  });

  it('F7: never changes the total', () => {
    let seed = 11;
    const random = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % limit;
    };
    const total = (widths: Record<string, number>) => Object.values(widths).reduce((sum, width) => sum + width, 0);
    for (let run = 0; run < 20_000; run++) {
      const count = 2 + random(4);
      const widths = Object.fromEntries(Array.from({ length: count }, (_, i) => [`panel${i}`, random(3) === 0 ? 50 : 300 + random(5) * 50]));
      const result = resolveFit(widths, random(count - 1), (random(2) ? 1 : -1) * (1 + random(1500))).widths;
      expect(total(result)).toBe(total(widths));
      for (const width of Object.values(result)) expect(width === 50 || width >= 300).toBe(true);
    }
  });
});

describe('fitPanels', () => {
  const panels = (...ids: string[]) => ids.map((id) => panel(id));
  const fitWith = (input: Partial<Parameters<typeof fitPanels>[0]> & { available: number; panels: PanelConfig[] }) =>
    fitPanels({ chosen: {}, autoCollapsed: [], ...input });

  it('F1: fills exactly, in proportion to what was chosen', () => {
    expect(fitWith({ panels: panels('a', 'b'), chosen: { a: 900, b: 300 }, available: 1200 }).widths).toEqual({ a: 900, b: 300 });
    expect(fitWith({ panels: panels('a', 'b'), available: 1001 }).widths).toEqual({ a: 500, b: 501 });
  });

  it('F1: holds a panel at min and the others pay', () => {
    expect(fitWith({ panels: panels('a', 'b'), chosen: { a: 900, b: 300 }, available: 700 }).widths).toEqual({ a: 400, b: 300 });
  });

  it('F3: closes the rightmost first', () => {
    const { widths, autoCollapsed } = fitWith({ panels: panels('a', 'b', 'c'), available: 700 });
    expect(widths).toEqual({ a: 325, b: 325, c: 50 });
    expect(autoCollapsed).toEqual(['c']);
  });

  it('F3: closes the least recently touched, and what is kept last', () => {
    const three = panels('a', 'b', 'c');
    expect(fitWith({ panels: three, available: 700, recency: ['b', 'c', 'a'] }).widths.b).toBe(50);
    expect(fitWith({ panels: three, available: 700, keep: ['c'] }).widths).toEqual({ a: 325, b: 50, c: 325 });
    expect(fitWith({ panels: three, available: 400, keep: ['c'] }).widths).toEqual({ a: 50, b: 50, c: 300 });
  });

  it('F4: reopens last closed first, with the margin to spare', () => {
    const three = panels('a', 'b', 'c');
    const closed = fitWith({ panels: three, available: 400 });
    expect(closed.autoCollapsed).toEqual(['c', 'b']);

    expect(fitWith({ panels: three, autoCollapsed: closed.autoCollapsed, available: 650 }).autoCollapsed).toEqual(['c', 'b']);
    expect(fitWith({ panels: three, autoCollapsed: closed.autoCollapsed, available: 674 }).autoCollapsed).toEqual(['c']);
    expect(fitWith({ panels: three, autoCollapsed: closed.autoCollapsed, available: 924 }).autoCollapsed).toEqual([]);
  });

  it('F4: reopens no panel the user closed', () => {
    expect(fitWith({ panels: panels('a', 'b'), chosen: { a: 400, b: 50 }, available: 3000 }).widths).toEqual({ a: 2950, b: 50 });
  });

  it('F6: keeps one open when nothing fits', () => {
    expect(fitWith({ panels: panels('a', 'b'), available: 100 }).widths).toEqual({ a: 300, b: 50 });
  });

  it('never closes a non-collapsible panel', () => {
    const mixed = [panel('a', { collapsible: false }), panel('b')];
    expect(fitWith({ panels: mixed, available: 400 }).widths).toEqual({ a: 350, b: 50 });
  });

  it('forgets an auto-closed panel the user closed or that left', () => {
    expect(fitWith({ panels: panels('a'), autoCollapsed: ['gone'], available: 500 }).autoCollapsed).toEqual([]);
    expect(fitWith({ panels: panels('a', 'b'), chosen: { b: 50 }, autoCollapsed: ['b'], available: 300 }).autoCollapsed).toEqual([]);
  });

  describe('F8: does not drift', () => {
    let seed = 23;
    const random = (limit: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % limit;
    };
    const stored = [Number.NaN, -5, 0, 1e9, undefined, Number.POSITIVE_INFINITY, 50, 300, 400, 800, 49, 301];
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

    it('stays valid through any sequence of resizes, panel changes and toggles, for any stored value', () => {
      for (let run = 0; run < 400; run++) {
        const mixed = random(2) === 1;
        const config = Object.fromEntries(
          ids.map((id) => [
            id,
            panel(id, mixed ? { minWidth: 200 + random(4) * 50, collapsedWidth: 40 + random(2) * 10, collapsible: random(4) !== 0 } : {}),
          ]),
        );
        const chosen = Object.fromEntries(ids.map((id) => [id, stored[random(stored.length)] as number]));
        let mounted = ids.slice(0, 1 + random(7));
        let autoCollapsed: string[] = [];
        const recency: string[] = [];
        let available = 500 + random(2200);

        for (let step = 0; step < 25; step++) {
          const chosenBefore = JSON.stringify(chosen);
          const action = random(5);
          let keep: string[] = [];
          let userAction = false;

          if (action === 0) available = 500 + random(2200);
          else if (action === 1) available = Math.max(300, available + (random(2) ? 15 : -15));
          else if (action === 2 && mounted.length < ids.length) mounted = ids.slice(0, mounted.length + 1);
          else if (action === 3 && mounted.length > 1) {
            const removed = mounted[random(mounted.length)];
            mounted = mounted.filter((id) => id !== removed);
          } else if (action === 4) {
            const id = mounted[random(mounted.length)];
            if (config[id].collapsible) {
              userAction = true;
              const isOpen = !(chosen[id] > 0 && chosen[id] <= config[id].collapsedWidth) && !autoCollapsed.includes(id);
              if (isOpen) chosen[id] = config[id].collapsedWidth;
              else {
                if (chosen[id] <= config[id].collapsedWidth) chosen[id] = config[id].minWidth;
                autoCollapsed = autoCollapsed.filter((other) => other !== id);
                keep = [id];
              }
              recency.push(id);
            }
          }

          const row = mounted.map((id) => config[id]);
          const result = fitPanels({ panels: row, chosen, autoCollapsed, available, recency, keep });
          autoCollapsed = result.autoCollapsed;

          if (!userAction) expect(JSON.stringify(chosen)).toBe(chosenBefore);

          const total = Object.values(result.widths).reduce((sum, width) => sum + width, 0);
          const allClosedWidth = row.reduce((sum, { collapsible, minWidth, collapsedWidth }) => sum + (collapsible ? collapsedWidth : minWidth), 0);
          const oneOpen =
            allClosedWidth + Math.max(...row.map(({ collapsible, minWidth, collapsedWidth }) => (collapsible ? minWidth - collapsedWidth : 0)));
          const openCount = row.filter(({ id, collapsedWidth }) => result.widths[id] > collapsedWidth).length;
          if (available >= oneOpen) {
            expect(total).toBeLessThanOrEqual(available + 0.001);
            if (openCount > 0) expect(total).toBeGreaterThanOrEqual(available - 0.001);
          }
          for (const { id, minWidth, collapsedWidth, collapsible } of row) {
            const width = result.widths[id];
            expect(Number.isFinite(width)).toBe(true);
            if (width !== collapsedWidth) expect(width).toBeGreaterThanOrEqual(minWidth - 0.001);
            if (!collapsible) expect(width).toBeGreaterThanOrEqual(minWidth - 0.001);
          }

          const again = fitPanels({ panels: row, chosen, autoCollapsed, available, recency, keep });
          expect(again.widths).toEqual(result.widths);
        }
      }
    });

    it('a 15px scrollbar coming and going changes nothing about which panels are open', () => {
      for (let available = 500; available < 2400; available += 7) {
        const row = ['a', 'b', 'c', 'd', 'e'].map((id) => panel(id));
        let autoCollapsed: string[] = [];
        const seen: string[] = [];
        for (let flap = 0; flap < 6; flap++) {
          const result = fitPanels({ panels: row, chosen: {}, autoCollapsed, available: available - (flap % 2 ? 15 : 0) });
          autoCollapsed = result.autoCollapsed;
          seen.push(autoCollapsed.join());
        }
        expect(new Set(seen.slice(2)).size).toBe(1);
      }
    });
  });
});
