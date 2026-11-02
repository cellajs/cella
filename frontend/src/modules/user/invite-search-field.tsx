import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { FormItem, FormLabel } from '~/modules/ui/field';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { UserCombobox } from '~/modules/user/user-combobox';

/** One person at a time. Picking moves them below, and the search is ready for the next. */
export function InviteSearchField({ channel, check, list, autoFocus, onToEmail }: InviteFieldProps) {
  const { t } = useTranslation();

  if (!channel) return null;

  return (
    <FormItem name="invite-people">
      <FormLabel>{t('c:invite_mode_search')}</FormLabel>
      <UserCombobox channel={channel} chosen={list.emails} onPick={list.addPerson} autoFocus={autoFocus} onToEmail={onToEmail} />
      <InviteFieldLine hint={t('c:invite_hint_search', { appName: appConfig.name })} list={list} check={check} />
    </FormItem>
  );
}
