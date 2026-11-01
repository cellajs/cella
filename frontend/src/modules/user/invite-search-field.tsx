import { useTranslation } from 'react-i18next';
import { FormField, FormItem } from '~/modules/ui/field';
import { InviteSummary } from '~/modules/user/invite-groups';
import type { InviteFieldProps } from '~/modules/user/invite-submit';
import { UserCombobox } from '~/modules/user/user-combobox';

export function InviteSearchField({ form, channel, check, unparsed }: InviteFieldProps) {
  const { t } = useTranslation();

  if (!channel) return null;

  return (
    <FormField
      control={form.control}
      name="emails"
      render={({ field: { onChange, value } }) => (
        <FormItem>
          <UserCombobox
            value={value}
            onChange={onChange}
            unparsed={unparsed}
            onRemoveUnparsed={(text) =>
              form.setValue(
                'unparsed',
                unparsed.filter((item) => item !== text),
                { shouldDirty: true },
              )
            }
            channel={channel}
            check={check}
          />
          <InviteSummary hint={t('c:invite_hint_search')} check={check} />
        </FormItem>
      )}
    />
  );
}
