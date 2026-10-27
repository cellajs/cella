import { CheckIcon } from 'lucide-react';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDelayedFlag } from '~/hooks/use-delayed-flag';
import { Spinner } from '~/modules/ui/spinner';
import { cn } from '~/utils/cn';
import type { CalculatedColumn, RowsChangeData } from '../types';

/** `pending` while the save of an edit runs, `saved` for a moment after it succeeds. */
export type EditStatus = 'pending' | 'saved';

type Edit<R> = { row: R; columnKey: string; status: EditStatus };

// A save that answers sooner shows no spinner, so a fast network never flashes one
const spinnerDelayMs = 300;
const savedShowMs = 1200;

/** The status of the edit in a row's column, looked up by the row object a cell renders. */
export const EditStatusContext = createContext<(row: unknown, columnKey: string) => EditStatus | undefined>(() => undefined);

/**
 * Tracks the edits whose `onRowsChange` returns a promise: until it settles the grid shows the edited row, then the
 * stored row with a check, or the stored row alone when it rejects. The promise resolves once the stored row holds the
 * change (a mutation's `onSuccess` updated the cache); a rejection only restores the row, the caller reports the error.
 */
export function useEditStatus<R>(rows: R[], rowKeyGetter: (row: R) => string, onRowsChange?: (rows: R[], data: RowsChangeData<R>) => unknown) {
  const [edits, setEdits] = useState<ReadonlyMap<string, Edit<R>>>(() => new Map());

  // A newer edit of the same row replaces its entry, so a settling older save changes nothing
  const replace = (key: string, from: Edit<R>, to?: Edit<R>) =>
    setEdits((current) => {
      if (current.get(key) !== from) return current;
      const next = new Map(current);
      if (to) next.set(key, to);
      else next.delete(key);
      return next;
    });

  const handleRowsChange = (changedRows: R[], data: RowsChangeData<R>) => {
    const result = onRowsChange?.(changedRows, data);
    if (!(result instanceof Promise)) return;

    const started = data.indexes.map((index) => {
      const edit: Edit<R> = { row: changedRows[index], columnKey: data.column.key, status: 'pending' };
      return [rowKeyGetter(edit.row), edit] as const;
    });
    setEdits((current) => new Map([...current, ...started]));

    result.then(
      () => {
        for (const [key, edit] of started) {
          const saved: Edit<R> = { ...edit, status: 'saved' };
          replace(key, edit, saved);
          setTimeout(() => replace(key, saved), savedShowMs);
        }
      },
      () => {
        for (const [key, edit] of started) replace(key, edit);
      },
    );
  };

  const editByRow = new Map<unknown, Edit<R>>();
  const shownRows = edits.size
    ? rows.map((row) => {
        const edit = edits.get(rowKeyGetter(row));
        if (!edit) return row;
        const shown = edit.status === 'pending' ? edit.row : row;
        editByRow.set(shown, edit);
        return shown;
      })
    : rows;

  const statusOf = (row: unknown, columnKey: string) => {
    const edit = editByRow.get(row);
    return edit?.columnKey === columnKey ? edit.status : undefined;
  };

  return { rows: shownRows, onRowsChange: onRowsChange && handleRowsChange, statusOf };
}

interface RenderEditStatusProps<R> {
  row: R;
  column: Pick<CalculatedColumn<R>, 'key' | 'placeholderValue'>;
  children?: ReactNode;
}

/** A cell value that shows its edit being saved: muted, with a spinner once the save takes 300 ms, then a check. */
export function RenderEditStatus<R>({ row, column, children }: RenderEditStatusProps<R>) {
  const { t } = useTranslation();
  const status = useContext(EditStatusContext)(row, column.key);
  const slow = useDelayedFlag(status === 'pending', spinnerDelayMs);

  const content = children ?? <span className="text-muted-foreground">{column.placeholderValue}</span>;
  if (!status) return content;

  return (
    <span aria-busy={status === 'pending' || undefined} className="flex min-w-0 flex-1 items-center justify-between gap-1.5">
      <span className={cn('truncate', status === 'pending' && 'text-muted-foreground')}>{content}</span>
      {slow && <Spinner className="size-4 shrink-0 text-muted-foreground" />}
      {status === 'saved' && (
        <CheckIcon
          role="status"
          aria-label={t('c:saved')}
          className="fade-in zoom-in-75 size-4 shrink-0 animate-in text-success motion-reduce:animate-none"
        />
      )}
    </span>
  );
}
