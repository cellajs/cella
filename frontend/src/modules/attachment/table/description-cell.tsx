import type { Attachment } from 'sdk';
import { AttachmentDescriptionTrigger } from '~/modules/attachment/attachment-description-trigger';

interface DescriptionCellProps {
  row: Attachment;
  tabIndex: number;
}

export function DescriptionCell({ row, tabIndex }: DescriptionCellProps) {
  return (
    <AttachmentDescriptionTrigger
      attachmentId={row.id}
      description={row.description}
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="w-full justify-start truncate font-normal"
    />
  );
}
