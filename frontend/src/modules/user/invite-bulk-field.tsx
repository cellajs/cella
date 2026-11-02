import { PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { FormControl, FormItem, FormLabel } from '~/modules/ui/field';
import { Textarea } from '~/modules/ui/textarea';
import { focusOnMount } from '~/modules/user/invite-result';
import type { InviteFieldProps } from '~/modules/user/invite-submit';

/** Any text, read only when asked. The box then closes to one row, and Add more opens it again. */
export function InviteBulkField({ list, autoFocus }: InviteFieldProps) {
  const { t } = useTranslation();
  const { hasList, pasted, emails, unparsed } = list;

  if (hasList && !list.pasteOpen) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span role="status" className="text-muted-foreground text-sm">
          {t('c:invite_list_count', { count: emails.length + unparsed.length })}
        </span>
        <Button ref={focusOnMount} type="button" variant="secondary" size="sm" onClick={() => list.setPasteOpen(true)}>
          <PlusIcon />
          {t('c:add_more')}
        </Button>
      </div>
    );
  }

  const close = () => {
    list.setPasted('');
    list.setPasteOpen(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <FormItem name="bulk-emails">
        <FormLabel>{t('c:invite_mode_bulk')}</FormLabel>
        <FormControl>
          <Textarea
            ref={autoFocus || hasList ? focusOnMount : undefined}
            value={pasted}
            onChange={({ target }) => list.setPasted(target.value)}
            placeholder={t('c:placeholder.paste_emails')}
            rows={4}
            className="max-h-[40vh] min-h-26 resize-y"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        </FormControl>
        <p className="text-muted-foreground text-sm">{t('c:invite_hint_bulk')}</p>
      </FormItem>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!pasted.trim()}
          onClick={() => {
            list.add(pasted);
            close();
          }}
        >
          {t('c:invite_check_list')}
        </Button>
        {hasList && (
          <Button type="button" variant="secondary" onClick={close}>
            {t('c:close')}
          </Button>
        )}
      </div>
    </div>
  );
}
