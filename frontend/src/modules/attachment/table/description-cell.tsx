import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { openAttachmentDescriptionSheet } from '~/modules/attachment/attachment-description-sheet';
import { attachmentDescriptionText } from '~/modules/attachment/helpers/description-text';
import { Button } from '~/modules/ui/button';

interface DescriptionCellProps {
  row: Attachment;
  tabIndex: number;
}

/** Plain-text preview of the description; activating it opens the collaborative editor in a sheet. */
export function DescriptionCell({ row, tabIndex }: DescriptionCellProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const text = attachmentDescriptionText(row.description);

  return (
    <Button
      ref={buttonRef}
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="w-full justify-start truncate font-normal"
      onClick={() => openAttachmentDescriptionSheet(row, buttonRef)}
    >
      {text ? (
        <span className="truncate">{text}</span>
      ) : (
        <span className="text-muted">{t('c:add_resource', { resource: t('c:description').toLowerCase() })}</span>
      )}
    </Button>
  );
}
