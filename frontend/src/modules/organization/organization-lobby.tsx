import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeftIcon, MenuIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { hierarchy } from 'shared';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { swapMotion } from '~/modules/common/motion-presets';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { navItems } from '~/modules/navigation/nav-items';
import { openNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { organizationQueryOptions } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { findMembership } from '~/query/enrichment/helpers';
import { getChannelRoute } from '~/utils/channel-route';

const lobbyRouteApi = getRouteApi('/_app/$tenantId/$organizationSlug/');

/** An organization's page with nothing of it open: it names the organization a rail press or a switcher pick moved to. */
export function OrganizationLobby() {
  const { t } = useTranslation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isMenuOpen = useNavigationStore((state) => state.navSheetOpen === 'menu');
  // A menu row closes the menu in the click that starts its navigation: the button stays away while the next page loads
  const isNavigating = useRouterState({ select: (state) => state.status === 'pending' });
  const organizationId = lobbyRouteApi.useRouteContext({ select: (context) => context.organization.id });
  const tenantId = lobbyRouteApi.useRouteContext({ select: (context) => context.tenantId });

  const { data: organization } = useSuspenseQuery(organizationQueryOptions(organizationId, tenantId));
  const { data: myMemberships } = useQuery(myMembershipsQueryOptions());
  const membership = findMembership(myMemberships?.results ?? [], organization.id);
  // The organization's roles alone: an app keeps a `you_are_role` key for those and no other
  const role = hierarchy.getRoles('organization').find((organizationRole) => organizationRole === membership?.role);

  // The organization's own menu, as its nav bar button opens it
  const openMenu = () => {
    const menuItem = navItems.find((item) => item.id === 'menu');
    if (menuItem?.sheet) openNavSheet('menu', menuItem.sheet(), menuButtonRef, { organization });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[10svh] text-center">
      {/* One link for avatar and name: hovering either underlines the name and brightens the avatar, as a table cell does */}
      <Link {...getChannelRoute(organization)} className="group/lobby-link focus-effect flex flex-col items-center rounded-lg p-2">
        <EntityAvatar
          className="size-18 rounded-xl text-3xl transition-opacity group-hover/lobby-link:opacity-100 sm:opacity-80"
          type={organization.entityType}
          id={organization.id}
          name={organization.name}
          url={organization.thumbnailUrl}
        />
        <h1 className="link-decoration group-active/lobby-link:link-decoration-strong mt-5 text-2xl font-semibold group-hover/lobby-link:underline">
          {organization.name}
        </h1>
      </Link>
      {role && <p className="text-muted-foreground mt-1 text-sm">{t(`c:you_are_role.${role}`)}</p>}
      <div className="mt-6 h-10">
        <AnimatePresence mode="wait" initial={false}>
          {isMenuOpen ? (
            <motion.p key="hint" {...swapMotion} className="text-muted-foreground flex h-10 items-center gap-2 text-sm">
              <ArrowLeftIcon className="motion-safe:animate-nudge-left size-4" />
              {t('c:continue_in_menu')}
            </motion.p>
          ) : isNavigating ? null : (
            <motion.div key="button" {...swapMotion}>
              <Button ref={menuButtonRef} onClick={openMenu}>
                <MenuIcon />
                {t('c:open_menu')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
