import type { MouseEvent } from 'react';
import type { Attachment } from 'sdk';
import { textFromDocument } from 'shared/blocknote';
import { openAttachmentDescriptionSheet } from '~/modules/attachment/attachment-description-sheet';
import { findAttachmentInCache } from '~/modules/attachment/query';
import { liveCellRef } from '~/modules/common/data-grid/cell-renderers';

/** Opens the description sheet for a table cell; a row not in the cache (unsynced upload) has nothing to edit yet. */
export function openDescriptionSheetFromCell(attachmentId: string, cell: HTMLElement | null) {
  const attachment = findAttachmentInCache(attachmentId);
  if (!attachment) return;
  openAttachmentDescriptionSheet(attachment, liveCellRef(cell));
}

interface DescriptionCellProps {
  row: Attachment;
  /** Editors reach the sheet through the grid's edit mode; viewers double-click the text. */
  editable: boolean;
}

/** Plain text so it can be selected and copied in place; null when empty, so the column placeholder shows. */
export function DescriptionCell({ row, editable }: DescriptionCellProps) {
  const text = textFromDocument(row.description);

  if (!text) return null;

  const onDoubleClick = editable
    ? undefined
    : (event: MouseEvent<HTMLSpanElement>) =>
        openDescriptionSheetFromCell(row.id, event.currentTarget.closest<HTMLElement>('[role="gridcell"]'));

  return (
    <span className="flex h-full w-full items-center font-light" onDoubleClick={onDoubleClick}>
      <span className="truncate">{text}</span>
    </span>
  );
}
