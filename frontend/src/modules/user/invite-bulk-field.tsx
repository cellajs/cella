import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusDot, tileTones } from '~/modules/common/expandable-tile';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { InviteSummary } from '~/modules/user/invite-groups';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { parseInviteText, withPasted } from '~/modules/user/select-emails';
import { cn } from '~/utils/cn';

export function InviteBulkField({ form, check, emails, unparsed }: InviteFieldProps) {
  const { t } = useTranslation();

  // Null until the user types: until then the box shows what the form holds, such as the email mode's chips.
  const [rawText, setRawText] = useState<string | null>(null);
  const marksRef = useRef<HTMLDivElement>(null);

  const text = rawText ?? [...emails, ...unparsed].join('\n');

  // `tidy` rewrites the box to one item per line, which is what keeps each mark next to its own line.
  const applyText = (next: string, tidy?: boolean) => {
    const parsed = parseInviteText(next);
    setRawText(tidy ? parsed.lines.join('\n') : next);
    form.setValue('emails', parsed.emails, { shouldDirty: true });
    form.setValue('unparsed', parsed.unparsed, { shouldDirty: true });
  };

  // A line with no text has no mark; before the box is tidied, a line with several addresses reads as its first.
  const marks = text.split('\n').map((line) => {
    const { emails: lineEmails, unparsed: lineRest } = parseInviteText(line);
    const address = lineEmails[0] ?? lineRest[0];
    return address ? check.viewOf(address) : null;
  });

  return (
    <FormItem name="bulk-emails">
      <FormLabel>{t('c:paste_emails')}</FormLabel>
      <div className="relative">
        <FormControl>
          <Textarea
            value={text}
            onChange={(event) => applyText(event.target.value)}
            onPaste={(event) => {
              event.preventDefault();
              applyText(withPasted(event), true);
            }}
            onBlur={() => rawText !== null && applyText(rawText, true)}
            onScroll={({ currentTarget }) => {
              if (marksRef.current) marksRef.current.scrollTop = currentTarget.scrollTop;
            }}
            placeholder={t('c:placeholder.paste_emails')}
            wrap="off"
            rows={Math.max(marks.length, 6)}
            className="max-h-[60vh] min-h-40 resize-none overflow-auto whitespace-pre pl-8 leading-6"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </FormControl>
        {/* Lies over the box, line for line: the box does not wrap, so each row sits on its own line */}
        <div ref={marksRef} aria-hidden="true" className="pointer-events-none absolute inset-px overflow-hidden rounded-md py-2 text-md sm:text-sm">
          {marks.map((view, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a row belongs to a line number, not to the text on it
            <div key={index} className="flex h-6 items-center justify-between pr-3 pl-3">
              {view && <StatusDot tone={view.tone} checking={view.checking} />}
              {view?.chipNote && <span className={cn('truncate bg-background pl-2 font-medium', tileTones[view.tone].text)}>{view.chipNote}</span>}
            </div>
          ))}
        </div>
      </div>
      <InviteSummary hint={t('c:invite_hint_bulk')} check={check} />
    </FormItem>
  );
}
