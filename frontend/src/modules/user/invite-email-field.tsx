import { type ClipboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Input } from '~/modules/ui/input';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import { focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { isInviteEmail, withPasted } from '~/modules/user/invite-text';

// Past the press that took focus: the list growing under the pointer would move what it is pressing.
const blurDelay = 200;

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
      <FormLabel>{t('c:paste_emails')}</FormLabel>
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
          onBlur={() => {
            setTimeout(() => {
              if (document.activeElement !== inputRef.current) list.commitTyped();
            }, blurDelay);
          }}
        />
      </FormControl>
      <InviteFieldLine hint={t('c:invite_hint_email')} list={list} check={check} />
    </FormItem>
  );
}
