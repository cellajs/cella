// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DataGrid } from '../data-grid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

type Row = { id: number; name: string };

it("a cell handler's stopPropagation and preventDefault reach React's event, so parent handlers see them", () => {
  const parentEvents: { defaultPrevented: boolean }[] = [];
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  const renderGrid = (onCellClick: (event: React.MouseEvent) => void) =>
    act(() =>
      root.render(
        <div onClick={(event) => parentEvents.push({ defaultPrevented: event.isDefaultPrevented() })}>
          <DataGrid<Row>
            columns={[{ key: 'name', name: 'Name' }]}
            rows={[{ id: 1, name: 'one' }]}
            rowKeyGetter={(row) => row.id}
            onCellClick={(_args, event) => onCellClick(event)}
          />
        </div>,
      ),
    );
  const click = () => act(() => container.querySelector('[role="gridcell"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  renderGrid((event) => event.stopPropagation());
  click();
  renderGrid((event) => event.preventDefault());
  click();

  expect(parentEvents).toEqual([{ defaultPrevented: true }]);
  act(() => root.unmount());
  container.remove();
});
