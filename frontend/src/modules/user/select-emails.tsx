import { type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { zMembershipInviteBody } from 'sdk/zod.gen';
import { StatusDot, type TileTone, tileTones } from '~/modules/common/expandable-tile';
import { MiddleCut } from '~/modules/common/middle-cut';
import { Chip } from '~/modules/ui/chip';
import { Input } from '~/modules/ui/input';
import type { InviteView } from '~/modules/user/use-invite-check';

/** True for exactly the addresses an invite submit accepts, so every chip passes the form. */
const isInviteEmail = (value: string) => zMembershipInviteBody.shape.emails.element.safeParse(value).success;

// Bounded on both sides, so a character no address may hold fails it whole: jöhn@x.com never reads as hn@x.com, nor a@x.xn--p1ai as a@x.xn.
const addressPattern = /(?<![^\s<(:"[])[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9_-])/gi;

/**
 * Reads any text as invite addresses: each line or comma- or semicolon-separated part gives the addresses in it,
 * lowercased and without repeats, and a part with none stays as `unparsed` so the form can name it. `lines` holds the
 * same items in reading order, one per line.
 */
export const parseInviteText = (text: string) => {
  const emails = new Set<string>();
  const unparsed = new Set<string>();
  const lines = new Set<string>();

  // A display name goes first: the comma in "Doe, Jane" <jane@x.com> separates nothing.
  for (const part of text.replace(/"[^"\n]*"(?=\s*<)/g, ' ').split(/[\n\r,;]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const found = (isInviteEmail(trimmed) ? [trimmed] : (trimmed.match(addressPattern) ?? []))
      .map((email) => email.toLowerCase())
      .filter(isInviteEmail);
    for (const email of found) {
      emails.add(email);
      lines.add(email);
    }
    if (!found.length) {
      unparsed.add(trimmed);
      lines.add(trimmed);
    }
  }

  return { emails: [...emails], unparsed: [...unparsed], lines: [...lines] };
};

/** The field's text with a paste in place of its selection, on lines of its own: an address typed before it stays whole. */
export const withPasted = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  const { value, selectionStart, selectionEnd } = event.currentTarget;
  return `${value.slice(0, selectionStart ?? value.length)}\n${event.clipboardData.getData('text')}\n${value.slice(selectionEnd ?? value.length)}`;
};

/** The usual case stays neutral; a tint only where an address differs, and a dashed edge where nothing goes out. */
const chipTones: Record<TileTone, string> = {
  success: '',
  info: 'intent-info soft-bg soft-border',
  warning: 'intent-warning soft-bg soft-border',
  destructive: 'intent-destructive soft-bg soft-border',
  muted: 'border-dashed bg-transparent text-muted-foreground',
};

interface InviteChipProps {
  address: string;
  view: InviteView;
  onRemove: () => void;
  /** Opens the text for editing. */
  onEdit?: () => void;
  /** Avatar of a person picked by name, which takes the status dot's place. */
  start?: ReactNode;
  /** Takes the address's place, such as a person's name. */
  children?: ReactNode;
}

/** An address as a chip that says what an invite does with it. */
export function InviteChip({ address, view: { tone, chipNote, checking }, onRemove, onEdit, start, children }: InviteChipProps) {
  const { t } = useTranslation();

  return (
    <Chip
      onRemove={onRemove}
      removeLabel={t('c:remove_resource', { resource: address })}
      start={start}
      end={chipNote && <span className={tileTones[tone].text}>· {chipNote}</span>}
      className={checking ? undefined : chipTones[tone]}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {!start && <StatusDot tone={tone} checking={checking} />}
        {onEdit ? (
          <button type="button" className="pointer-events-auto min-w-0 truncate underline decoration-dotted underline-offset-3" onClick={onEdit}>
            {address}
          </button>
        ) : (
          (children ?? <MiddleCut text={address} />)
        )}
      </span>
    </Chip>
  );
}

interface SelectEmailsProps {
  value: string[];
  onChange: (value: string[]) => void;
  /** Text that holds no address, shown as chips a click opens for editing. */
  unparsed: string[];
  onUnparsedChange: (value: string[]) => void;
  placeholder?: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  viewOf: (address: string) => InviteView;
  /** From a number of addresses on, a list below the input shows them. */
  hideChips?: boolean;
}

/**
 * Email chip input. Enter, comma, semicolon, a space after an address, paste and blur turn the typed text into chips,
 * through the same parser as a pasted list. An address that already is a chip is skipped.
 */
export function SelectEmails({ value: emails, onChange, unparsed, onUnparsedChange, placeholder, inputProps, viewOf, hideChips }: SelectEmailsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const commit = (value: string) => {
    const parsed = parseInviteText(value);
    const newEmails = parsed.emails.filter((email) => !emails.some((chip) => chip.toLowerCase() === email));
    const newUnparsed = parsed.unparsed.filter((item) => !unparsed.includes(item));

    if (newEmails.length) onChange([...emails, ...newEmails]);
    if (newUnparsed.length) onUnparsedChange([...unparsed, ...newUnparsed]);
    setText('');
  };

  // A removed chip unmounts its focused remove button, so focus goes to the input and not to the page
  const removeEmail = (email: string) => {
    onChange(emails.filter((chip) => chip !== email));
    inputRef.current?.focus();
  };
  const removeUnparsed = (item: string) => {
    onUnparsedChange(unparsed.filter((chip) => chip !== item));
    inputRef.current?.focus();
  };

  const editUnparsed = (item: string) => {
    removeUnparsed(item);
    setText(item);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      // Also on an empty input, so Enter never submits the surrounding form.
      event.preventDefault();
      if (text.trim()) commit(text);
    } else if (event.key === 'Backspace' && !text && !hideChips) {
      const last = unparsed.at(-1);
      if (last) {
        event.preventDefault();
        removeUnparsed(last);
      } else if (emails.length) {
        event.preventDefault();
        removeEmail(emails[emails.length - 1]);
      }
    }
  };

  // An input flattens pasted lines to spaces, which would lose what sets the parts apart.
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!/[\n,;]|@.+\./.test(event.clipboardData.getData('text'))) return;
    event.preventDefault();
    commit(withPasted(event));
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click on the padding forwards focus to the input, which takes the keys
    <div
      onClick={(event) => event.target === event.currentTarget && inputRef.current?.focus()}
      className="focus-within-effect flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-3 py-1"
    >
      {!hideChips && emails.map((email) => <InviteChip key={email} address={email} view={viewOf(email)} onRemove={() => removeEmail(email)} />)}
      {!hideChips &&
        unparsed.map((item) => (
          <InviteChip key={item} address={item} view={viewOf(item)} onRemove={() => removeUnparsed(item)} onEdit={() => editUnparsed(item)} />
        ))}
      <Input
        ref={inputRef}
        type="text"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        placeholder={placeholder}
        value={text}
        {...inputProps}
        onChange={({ target }) => (/[,;]|@\S*\s/.test(target.value) ? commit(target.value) : setText(target.value))}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => text.trim() && commit(text)}
        className="-my-px h-8 min-w-32 grow basis-32 border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
