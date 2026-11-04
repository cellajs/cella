import { useTranslation } from 'react-i18next';
import { FormItem, FormLabel } from '~/modules/ui/field';
import { InviteFieldLine } from '~/modules/user/invite-groups';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { UserCombobox } from '~/modules/user/user-combobox';

/** One person at a time. A pick moves them below and keeps its check in the results, where a press removes them again. */
export function InviteSearchField({ channel, check, list, autoFocus, onToEmail }: InviteFieldProps) {
  const { t } = useTranslation();

  if (!channel) return null;

  return (
    <FormItem name="invite-people">
      <FormLabel help={t('c:invite_hint_search')}>{t('c:invite_who')}</FormLabel>
      <UserCombobox
        channel={channel}
        chosen={list.emails}
        onPick={list.addPerson}
        onRemove={list.remove}
        autoFocus={autoFocus}
        onToEmail={onToEmail}
      />
      <InviteFieldLine list={list} check={check} />
    </FormItem>
  );
}
