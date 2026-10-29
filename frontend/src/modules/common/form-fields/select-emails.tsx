import { ClockIcon, LoaderCircleIcon, UserCheckIcon } from 'lucide-react';
import { type InputHTMLAttributes, type KeyboardEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { MiddleCut } from '~/modules/common/middle-cut';
import { toaster } from '~/modules/common/toaster/toaster';
import { Chip } from '~/modules/ui/chip';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

const delimiter = /[,;\s]+/;

/** True for exactly the addresses an invite submit accepts, so every chip passes the form. */
export const isInviteEmail = (value: string) => zMembershipInviteBody.shape.emails.element.safeParse(value).success;

/** What a chip says about its address: still being checked, invited before or already a member, with a short note. */
export interface EmailChipState {
  state: 'checking' | 'invited' | 'member' | 'new';
  note?: string;
}

interface SelectEmailsProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  /** Marks each chip; a member's chip is dashed, since an invite leaves it out. */
  chipState?: (email: string) => EmailChipState;
}

const stateIcons = { checking: LoaderCircleIcon, invited: ClockIcon, member: UserCheckIcon };

/**
 * Email chip input. Enter, comma, semicolon, space, paste and blur turn the typed text into chips. An address that
 * already is a chip in any letter case is skipped; text that is not an address stays in the input with a warning.
 */
export function SelectEmails({ value: emails = [], onChange, placeholder, inputProps, chipState }: SelectEmailsProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const commit = (value: string) => {
    const next = [...emails];
    const rejected: string[] = [];
    for (const email of value.split(delimiter)) {
      if (!email || next.some((chip) => chip.toLowerCase() === email.toLowerCase())) continue;
      (isInviteEmail(email) ? next : rejected).push(email);
    }

    if (rejected.length) toaster.warning(t('error:invalid_email'), { description: rejected.join(', ') });
    if (next.length > emails.length) onChange?.(next);
    setText(rejected.join(' '));
  };

  const remove = (email: string) => onChange?.(emails.filter((chip) => chip !== email));

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Also on an empty input, so Enter never submits the surrounding form.
      event.preventDefault();
      if (text.trim()) commit(text);
    } else if (event.key === 'Backspace' && !text && emails.length) {
      event.preventDefault();
      remove(emails[emails.length - 1]);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the padding forwards focus to the input, which takes the keys
    <div
      onClick={(event) => event.target === event.currentTarget && inputRef.current?.focus()}
      className="focus-within-effect flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1"
    >
      {emails.map((email) => {
        const { state, note } = chipState?.(email) ?? { state: 'new' };
        const Icon = state === 'new' ? null : stateIcons[state];
        return (
          <Chip
            key={email}
            onRemove={() => remove(email)}
            removeLabel={t('c:remove_resource', { resource: email })}
            end={note && <span className="text-muted-foreground">· {note}</span>}
            className={cn(state === 'member' && 'border-dashed bg-transparent text-muted-foreground', Icon && 'pl-2')}
          >
            <span className="flex min-w-0 items-center">
              {Icon && <Icon className={cn('mr-1 size-3.5 shrink-0 opacity-70', state === 'checking' && 'animate-spin')} />}
              <MiddleCut text={email} />
            </span>
          </Chip>
        );
      })}
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={text}
        {...inputProps}
        onChange={({ target }) => (delimiter.test(target.value) ? commit(target.value) : setText(target.value))}
        onKeyDown={handleKeyDown}
        onBlur={() => text.trim() && commit(text)}
        className="-my-px h-8 min-w-32 grow basis-32 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
