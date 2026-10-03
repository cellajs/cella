import { XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { toaster } from '~/modules/common/toaster/toaster';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { cn } from '~/utils/cn';

const delimiter = /[,;\s]+/;

/** True for exactly the addresses an invite submit accepts, so every chip passes the form. */
export const isInviteEmail = (value: string) => zMembershipInviteBody.shape.emails.element.safeParse(value).success;

interface SelectEmailsProps {
  emails?: string[];
  onValueChange?: (emails: string[]) => void;
  placeholder?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/**
 * Email chip input. Enter, comma, semicolon, space, paste and blur turn the typed text into chips. An address that
 * already is a chip in any letter case is skipped; text that is not an address stays in the input with a warning.
 */
export function SelectEmails({ emails = [], onValueChange, placeholder, inputProps }: SelectEmailsProps) {
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
    if (next.length > emails.length) onValueChange?.(next);
    setText(rejected.join(' '));
  };

  const remove = (email: string) => onValueChange?.(emails.filter((chip) => chip !== email));

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
      className="focus-effect flex flex-row flex-wrap items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ring-offset-background focus-ring:focus-within:ring-2 focus-ring:focus-within:ring-ring focus-ring:focus-within:ring-offset-2"
    >
      {emails.length > 0 && (
        <div className="flex flex-row flex-wrap gap-1 rounded-md pr-1">
          {emails.map((email) => (
            <Badge key={email} className="gap-0.5 pr-0">
              {email}
              <Button
                type="button"
                variant="ghost"
                size="micro"
                aria-label={t('c:remove_resource', { resource: email })}
                onClick={() => remove(email)}
                className="size-4.5 cursor-pointer rounded-full p-0 ring-inset focus-ring:focus-visible:ring-2"
                press={false}
              >
                <XIcon />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        value={text}
        {...inputProps}
        onChange={({ target }) => (delimiter.test(target.value) ? commit(target.value) : setText(target.value))}
        onKeyDown={onKeyDown}
        onBlur={() => text.trim() && commit(text)}
        className={cn(
          '-my-px h-8 w-auto grow border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0',
          emails.length && 'ml-1',
        )}
      />
    </div>
  );
}
