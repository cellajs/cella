import { type ClipboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Input, skipPasswordManagers } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import { afterFocusLeaves, focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { isInviteEmail, withPasted } from '~/modules/user/invite-text';
import { UserCombobox } from '~/modules/user/user-combobox';

/** One address at a time. Enter, a separator or leaving the field moves it below, and the field is ready for the next. */
export function InviteEmailField({ check, list, autoFocus }: InviteFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = (value: string) => {
    const whole = value.match(/^(\S+)[\s,;]$/)?.[1];
    if (whole && isInviteEmail(whole)) list.commitTyped(whole);
    else list.setTyped(value);
  };

  // An input flattens pasted lines to spaces, which would lose what sets the parts apart.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!list.typed && isInviteEmail(pasted.trim())) return;
    if (!/[\n,;]|@.+\./.test(pasted)) return;
    event.preventDefault();
    list.add(withPasted(event));
    list.setTyped('');
  };

  return (
    <FormItem name="invite-emails">
      <FormLabel help={t('c:invite_hint_email')}>{t('c:invite_who')}</FormLabel>
      <FormControl>
        <Input
          ref={(node) => {
            inputRef.current = node;
            if (autoFocus) focusOnMount(node);
          }}
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="enter"
          {...skipPasswordManagers}
          placeholder={t('c:placeholder.email')}
          aria-invalid={list.typedInvalid || undefined}
          value={list.typed}
          onChange={({ target }) => handleChange(target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            // Also on an empty input, so Enter never submits the surrounding form
            event.preventDefault();
            list.commitTyped();
          }}
          onPaste={handlePaste}
          onBlur={() => afterFocusLeaves(inputRef.current, () => list.commitTyped())}
        />
      </FormControl>
      <InviteFieldLine list={list} check={check} />
    </FormItem>
  );
}

/** One person at a time. A pick moves them below and keeps its check in the results, where a press removes them again. */
export function InviteSearchField({ channel, check, list, autoFocus, onToEmail }: InviteFieldProps) {
  const { t } = useTranslation();

  if (!channel) return null;

  return (
    <FormItem name="invite-people">
      <FormLabel help={t('c:invite_hint_search')}>{t('c:invite_who')}</FormLabel>
      <UserCombobox {...{ channel, autoFocus, onToEmail }} chosen={list.emails} onPick={list.addPerson} onRemove={list.remove} />
      <InviteFieldLine list={list} check={check} />
    </FormItem>
  );
}

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
