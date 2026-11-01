import { useTranslation } from 'react-i18next';
import { FormField, FormItem, FormLabel } from '~/modules/ui/field';
import { InviteGroups, InviteSummary } from '~/modules/user/invite-groups';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { parseInviteText, SelectEmails } from '~/modules/user/select-emails';

// From this many addresses on, the chips are too many to read and a list takes their place
const groupFrom = 9;

const inputId = 'invite-emails';

export function InviteEmailField({ form, check, emails, unparsed }: InviteFieldProps) {
  const { t } = useTranslation();

  const setEmails = (next: string[]) => form.setValue('emails', next, { shouldDirty: true });
  const setUnparsed = (next: string[]) => form.setValue('unparsed', next, { shouldDirty: true });

  // A removed row unmounts its focused remove button, so focus goes to the input and not to the page
  const remove = (address: string) => {
    setEmails(emails.filter((email) => email !== address));
    setUnparsed(unparsed.filter((item) => item !== address));
    document.getElementById(inputId)?.focus();
  };

  const fix = (address: string, text: string) => {
    if (text === address) return;
    const parsed = parseInviteText(text);
    setEmails([...new Set([...emails, ...parsed.emails])]);
    setUnparsed([...new Set([...unparsed.filter((item) => item !== address), ...parsed.unparsed])]);
  };

  const showList = emails.length + unparsed.length >= groupFrom;

  return (
    <>
      <FormField
        control={form.control}
        name="emails"
        render={({ field: { onChange, value } }) => (
          <FormItem>
            <FormLabel htmlFor={inputId}>{t('c:paste_emails')}</FormLabel>
            <SelectEmails
              placeholder={t('c:add_email')}
              value={value}
              onChange={onChange}
              unparsed={unparsed}
              onUnparsedChange={setUnparsed}
              hideChips={showList}
              inputProps={{ id: inputId, autoComplete: 'off' }}
              viewOf={check.viewOf}
            />
            <InviteSummary hint={t('c:invite_hint_email')} check={check} />
          </FormItem>
        )}
      />
      {showList && <InviteGroups check={check} onRemove={remove} onFix={fix} />}
    </>
  );
}
