import type { UserMinimalBase } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { AvatarGroup } from '~/modules/ui/avatar';
import { useOpenUserSheet } from '~/modules/user/use-open-user-sheet';
import { cn } from '~/utils/cn';
import { formatCount } from '~/utils/format-count';

interface MemberAvatarProps {
  member: Pick<UserMinimalBase, 'id' | 'name' | 'thumbnailUrl'>;
  className?: string;
}

/** A user's avatar as a button that opens their user sheet, with the name as tooltip. */
function MemberAvatar({ member, className }: MemberAvatarProps) {
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

interface MemberAvatarGroupProps {
  members: MemberAvatarProps['member'][];
  /** Members in all: those past the shown ones fold into a +N bubble. */
  total: number;
  /** Sizes each avatar and the bubble alike. */
  itemClassName: string;
  className?: string;
}

/** Overlapping member avatars, ringed in the background color, with a +N bubble for the members not shown. */
export function MemberAvatarGroup({ members, total, itemClassName, className }: MemberAvatarGroupProps) {
  const overflow = total - members.length;

  return (
    <AvatarGroup className={className}>
      {members.map((member) => (
        <MemberAvatar key={member.id} member={member} className={cn('border-background/70', itemClassName)} />
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            'z-10 flex items-center justify-center rounded-full border-2 border-background/70 more-contrast:border-black/85 bg-muted/75 bg-clip-padding font-semibold more-contrast:text-foreground text-muted-foreground text-xs tracking-tighter backdrop-blur-xs',
            itemClassName,
          )}
        >
          +{formatCount(overflow)}
        </div>
      )}
    </AvatarGroup>
  );
}
