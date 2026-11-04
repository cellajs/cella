import { type ClipboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Input, skipPasswordManagers } from '~/modules/ui/input';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import { afterFocusLeaves, focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { isInviteEmail, withPasted } from '~/modules/user/invite-text';

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
