import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeAuthData } from 'sdk';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { dateShort } from '~/utils/date-short';

interface IdentityTileProps {
  icon: ReactNode;
  /** The provider or institution. */
  title: string;
  identity: Omit<MeAuthData['oauthIdentities'][number], 'provider'>;
  /** The federation an institution's identity came through. */
  via?: string;
  expanded: boolean;
  onToggle: () => void;
}

/** An OAuth or institution identity the account holds, named by the address its issuer asserted last. */
export function IdentityTile({ icon, title, identity, via, expanded, onToggle }: IdentityTileProps) {
  const { t } = useTranslation();

  return (
    <ExpandableTile
      icon={icon}
      title={title}
      meta={identity.email ?? t('c:connected_on', { date: dateShort(identity.createdAt) })}
      expanded={expanded}
      onToggle={onToggle}
      details={
        <>
          <ExpandableTileDetail label={t('c:connected')}>{dateShort(identity.createdAt)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:last_used')}>
            {identity.lastUsedAt ? dateShort(identity.lastUsedAt) : t('c:never_used')}
          </ExpandableTileDetail>
          {via && <ExpandableTileDetail label={t('c:via')}>{via}</ExpandableTileDetail>}
        </>
      }
    />
  );
}
