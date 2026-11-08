import { type ClipboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import { tileTones } from '~/modules/common/expandable-tile';
import { StatusDot } from '~/modules/common/status-dot';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Input, skipPasswordManagers } from '~/modules/ui/input';
import { Textarea } from '~/modules/ui/textarea';
import { focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { isInviteEmail } from '~/modules/user/invite-text';
import type { InviteCheck } from '~/modules/user/use-invite-check';
import type { InviteList } from '~/modules/user/use-invite-list';
import { UserCombobox } from '~/modules/user/user-combobox';
import { cn } from '~/utils/cn';

// Past the press that took focus: the list growing under the pointer would move what it is pressing.
const blurDelay = 200;

/** Runs once focus has settled outside the field it left. */
const afterFocusLeaves = (field: HTMLElement | null, run: () => void) => {
  setTimeout(() => {
    if (document.activeElement !== field) run();
  }, blurDelay);
};

/** The field's text with a paste in place of its selection, on lines of its own: an address typed before it stays whole. */
const withPasted = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  const before = value.slice(0, selectionStart ?? value.length);
  const after = value.slice(selectionEnd ?? value.length);
  return `${before}\n${event.clipboardData.getData('text')}\n${after}`;
};

/**
 * The line under a field, shown only for text that is no address. What happened to an address is spoken only: its tile
 * rolls its count and its dot pulses. Stays mounted, so a change is announced.
 */
function InviteFieldLine({ list, check }: { list: InviteList; check: InviteCheck }) {
  const { t } = useTranslation();
  const { last, typedInvalid, people, emails, unparsed } = list;
  const listed = last && !last.repeat && (emails.includes(last.address) || unparsed.includes(last.address)) ? last.address : null;

  const content = () => {
    if (typedInvalid) {
      return (
        <>
          <StatusDot variant="destructive" pulse={false} />
          <span className="min-w-0">
            <span className={cn('font-medium', tileTones.destructive.text)}>{t('c:invite_state_not_address')}</span>
            {` · ${lowercaseLabel(t('c:invite_state_check_spelling'))}`}
          </span>
        </>
      );
    }
    if (last?.repeat) return t('c:invite_already_listed', { address: last.address });
    if (listed) {
      const { word, note } = check.viewOf(listed);
      return [word, people.get(listed)?.name ?? listed, note].filter(Boolean).join(' · ');
    }
    return null;
  };

  return (
    <div role="status" className={cn('text-muted-foreground flex items-baseline gap-1.5 text-sm', !typedInvalid && 'sr-only')}>
      {content()}
    </div>
  );
}

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
