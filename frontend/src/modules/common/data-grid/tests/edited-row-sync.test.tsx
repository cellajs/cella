// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DataGrid } from '../data-grid';
import type { Column } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  {
    key: 'name',
    name: 'Name',
    renderEditCell: ({ row, onRowChange }) => <input value={row.name} onChange={(event) => onRowChange({ ...row, name: event.target.value })} />,
  },
];

it('a row synced in above the edited row leaves the editor open on that row with the typed text', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const first = { id: 'a', name: 'A' };
  const edited = { id: 'b', name: 'B' };
  const renderGrid = (rows: Row[]) => act(() => root.render(<DataGrid<Row> columns={columns} rows={rows} rowKeyGetter={(row) => row.id} />));

  renderGrid([first, edited]);
  const cell = container.querySelector('[role="row"][aria-rowindex="3"] [role="gridcell"]')!;
  act(() => cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  const input = container.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Typed');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  renderGrid([{ id: 'x', name: 'X' }, first, edited]);

  const editor = container.querySelector('input');
  expect(editor?.value).toBe('Typed');
  expect(editor?.closest('[role="row"]')?.getAttribute('aria-rowindex')).toBe('4');

  // The rows above leave: the edited row is the only one left, past where its index pointed.
  renderGrid([edited]);
  const editorAfterRemoval = container.querySelector('input');
  expect(editorAfterRemoval?.value).toBe('Typed');
  expect(editorAfterRemoval?.closest('[role="row"]')?.getAttribute('aria-rowindex')).toBe('2');
  act(() => root.unmount());
  container.remove();
});
