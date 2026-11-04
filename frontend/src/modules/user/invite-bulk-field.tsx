import { type ClipboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import { afterFocusLeaves, focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { withPasted } from '~/modules/user/invite-text';

/** Any text. A paste moves its addresses below at once, typed text when the box loses focus, and the box is ready for the next. */
export function InviteBulkField({ check, list, autoFocus }: InviteFieldProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    list.add(withPasted(event));
    list.setPasted('');
  };

  return (
    <FormItem name="bulk-emails">
      <FormLabel help={t('c:invite_hint_bulk')}>{t('c:invite_who')}</FormLabel>
      <FormControl>
        <Textarea
          ref={(node) => {
            textareaRef.current = node;
            if (autoFocus) focusOnMount(node);
          }}
          value={list.pasted}
          onChange={({ target }) => list.setPasted(target.value)}
          onPaste={handlePaste}
          onBlur={() => afterFocusLeaves(textareaRef.current, list.commitPasted)}
          placeholder={t('c:placeholder.paste_emails')}
          rows={4}
          className="max-h-[40vh] min-h-26 resize-y"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </FormControl>
      <InviteFieldLine list={list} check={check} />
    </FormItem>
  );
}
