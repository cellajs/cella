// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DataGrid } from '../data-grid';
import type { Column, ColumnWidths } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  { key: 'name', name: 'Name', resizable: true, minWidth: 80 },
  { key: 'id', name: 'ID' },
];

/** Holds the widths the way DataTable does: a new resetKey drops them. */
function Table({ resetKey }: { resetKey: number }) {
  const [widths, setWidths] = useState<{ key: number; map: ColumnWidths }>({ key: resetKey, map: new Map() });
  return (
    <DataGrid<Row>
      columns={columns}
      rows={[{ id: 'a', name: 'A' }]}
      rowKeyGetter={(row) => row.id}
      columnWidths={widths.key === resetKey ? widths.map : new Map()}
      onColumnWidthsChange={(map) => setWidths({ key: resetKey, map })}
    />
  );
}

it('after a keyboard resize, the grid shows the widths its parent resets to', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const templateColumns = () => container.querySelector<HTMLElement>('[role="grid"]')!.style.gridTemplateColumns;

  act(() => root.render(<Table resetKey={0} />));
  const initial = templateColumns();
  const header = container.querySelector('[role="columnheader"]')!;
  act(() => header.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true })));
  expect(templateColumns()).not.toBe(initial);

  act(() => root.render(<Table resetKey={1} />));

  expect(templateColumns()).toBe(initial);
  act(() => root.unmount());
  container.remove();
});
