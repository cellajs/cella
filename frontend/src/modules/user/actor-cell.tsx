import { BotIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ActorRef } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { MatchScope } from '~/modules/common/match-highlight/match-scope';
import { Badge } from '~/modules/ui/badge';
import { UserCell } from '~/modules/user/user-cell';
import { cn } from '~/utils/cn';

interface ActorCellProps {
  /** Who wrote the row, as `createdBy`, `updatedBy` and `deletedBy` carry it. */
  actor: ActorRef;
  tabIndex: number;
  compactable?: boolean;
  className?: string;
  readOnly?: boolean;
}

/** A writer of a row: a user opens the user sheet like any user cell; a service account shows as a name with a badge. */
export function ActorCell({ actor, tabIndex, compactable, className, readOnly }: ActorCellProps) {
  const { t } = useTranslation();

  if (actor.kind === 'user') {
    // No list searches its writers, so a writer's name never takes the list's marks
    return (
      <MatchScope terms={[]}>
        <UserCell
          user={{ ...actor, slug: actor.slug ?? '', entityType: 'user' }}
          tabIndex={tabIndex}
          compactable={compactable}
          className={className}
          readOnly={readOnly}
        />
      </MatchScope>
    );
  }

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <EntityAvatar className="size-8" id={actor.id} name={actor.name} icon={BotIcon} />
      <span className="truncate">{actor.name}</span>
      <Badge variant="outline" className="shrink-0">
        {t('c:service_account')}
      </Badge>
    </span>
  );
}
