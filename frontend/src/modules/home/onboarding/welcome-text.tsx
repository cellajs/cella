import { ArrowDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { TextEffect } from '~/modules/common/text-effect';
import type { Invitation, UserMenu, UserMenuItem } from '~/modules/me/types';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';

interface WelcomeTextProps {
  invitations: Invitation[];
  organizations: Organization[];
  onStart: () => void;
}

/** The channel below the organization the user joined last: membership ids are UUID v7, so they sort by creation. */
const lastJoinedBelow = (menu: UserMenu, organizationId: string) => {
  const items = Object.values(menu).flatMap((section) => section.flatMap((item) => [item, ...(item.submenu ?? [])]));
  const below = items.filter((item) => item.entityType !== 'organization' && item.organizationId === organizationId);
  return below.reduce<UserMenuItem | undefined>((last, item) => (last && last.membership.id > item.membership.id ? last : item), undefined);
};

export function WelcomeText({ invitations, organizations, onStart }: WelcomeTextProps) {
  const { t } = useTranslation();
  const { menu } = useMenu(useCurrentUser().id);

  // An invited or joined user is greeted with what they came for, not with the pitch for starting something new.
  const [firstInvitation] = invitations;
  const [firstOrganization] = organizations;
  let text: string = t('c:onboarding_welcome.text');
  if (invitations.length > 1) text = t('c:onboarding_welcome_invitations.text', { count: invitations.length });
  else if (firstInvitation) {
    const { entity, organizationName } = firstInvitation;
    text = organizationName
      ? t('c:onboarding_welcome_invited_in_organization.text', { entityName: entity.name, organizationName })
      : t('c:onboarding_welcome_invited.text', { entityName: entity.name });
  } else if (firstOrganization) {
    const joined = lastJoinedBelow(menu, firstOrganization.id);
    text = joined
      ? t('c:onboarding_welcome_member_in_organization.text', { entityName: joined.name, organizationName: firstOrganization.name })
      : t('c:onboarding_welcome_member.text', { entityName: firstOrganization.name });
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">{t('c:onboarding_welcome')}</h1>
      <TextEffect text={text} className="text-foreground pb-8 text-2xl font-medium sm:text-4xl sm:leading-12 md:text-5xl md:leading-16" />
      <Button onClick={onStart} className="max-sm:w-full">
        {t('c:get_started')}
        <ArrowDownIcon className="repeat-5 -rotate-90 animate-bounce motion-reduce:animate-none" />
      </Button>
    </div>
  );
}
