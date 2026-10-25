import type { UserMinimalBase } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';
import { cn } from '~/utils/cn';

interface MemberAvatarProps {
  member: Pick<UserMinimalBase, 'id' | 'name' | 'thumbnailUrl'>;
  className?: string;
}

/** A user's avatar as a button that opens their user sheet, with the name as tooltip. */
export function MemberAvatar({ member, className }: MemberAvatarProps) {
  const openUserSheet = useOpenUserSheet();

  return (
    <TooltipButton toolTipContent={member.name}>
      <button
        type="button"
        onClick={() => openUserSheet(member.id)}
        aria-label={member.name}
        className="focus-effect cursor-pointer rounded-full focus-visible:ring-offset-1"
      >
        <EntityAvatar
          type="user"
          id={member.id}
          name={member.name}
          url={member.thumbnailUrl}
          className={cn('size-7 border-2 border-black/25 more-contrast:border-black/85 text-xs', className)}
        />
      </button>
    </TooltipButton>
  );
}
