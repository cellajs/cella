import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { textFromDocument } from 'shared/blocknote';
import { openAttachmentDescriptionSheet } from '~/modules/attachment/attachment-description-sheet';
import { findAttachmentInCache } from '~/modules/attachment/query';
import { Button, type ButtonProps } from '~/modules/ui/button';

interface AttachmentDescriptionTriggerProps extends Pick<ButtonProps, 'variant' | 'size' | 'className' | 'tabIndex'> {
  attachmentId: string;
  description: string | null | undefined;
  /** Runs before the sheet opens (the dialog closes itself, as sheets stack below dialogs). */
  beforeOpen?: () => void;
}

/** The description as plain text, or an "add description" placeholder; activating it opens the editor sheet. */
export function AttachmentDescriptionTrigger({
  attachmentId,
  description,
  beforeOpen,
  ...buttonProps
}: AttachmentDescriptionTriggerProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const text = textFromDocument(description);

  const open = () => {
    // The sheet edits the cached row; a row not in the cache (unsynced upload) has nothing to edit yet.
    const attachment = findAttachmentInCache(attachmentId);
    if (!attachment) return;
    beforeOpen?.();
    openAttachmentDescriptionSheet(attachment, buttonRef);
  };

  return (
    <Button ref={buttonRef} onClick={open} {...buttonProps}>
      {text ? (
        <span className="truncate">{text}</span>
      ) : (
        <span className="text-muted">{t('c:add_resource', { resource: t('c:description').toLowerCase() })}</span>
      )}
    </Button>
  );
}
