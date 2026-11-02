import { BanIcon, CircleAlertIcon, MailIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import type { TKey } from '~/lib/i18n-locales';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { ExpandableTile, StatusDot, tileTones } from '~/modules/common/expandable-tile';
import type { IconComponent } from '~/modules/common/icons/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
import { Input } from '~/modules/ui/input';
import type { InviteCheck, InviteGroupKey } from '~/modules/user/use-invite-check';
import type { InviteList, InvitePerson } from '~/modules/user/use-invite-list';
import { cn } from '~/utils/cn';

/** Biggest problem first. New addresses are no problem, so that tile never opens by itself. */
const inviteTiles: { key: InviteGroupKey; summary: TKey; word: TKey; note: TKey; icon: IconComponent }[] = [
  { key: 'fix', summary: 'c:invite_summary_fix', word: 'c:invite_state_not_address', note: 'c:invite_state_edit_or_remove', icon: CircleAlertIcon },
  {
    key: 'unchecked',
    summary: 'c:invite_summary_unchecked',
    word: 'c:invite_tile_unchecked',
    note: 'c:invite_tile_unchecked.text',
    icon: CircleAlertIcon,
  },
  { key: 'out', summary: 'c:invite_summary_out', word: 'c:invite_tile_out', note: 'c:invite_tile_out.text', icon: BanIcon },
  { key: 'again', summary: 'c:invite_summary_again', word: 'c:invite_tile_again', note: 'c:invite_tile_again.text', icon: RotateCcwIcon },
  { key: 'new', summary: 'c:invite_summary_new', word: 'c:invite_group_new', note: 'c:invite_tile_new.text', icon: MailIcon },
];

const tileTone = { fix: 'destructive', unchecked: 'warning', out: 'muted', again: 'info', new: 'success' } as const;

const firstChips = 6;
const revealStep = 50;
// More hidden than this at once would be a sudden wall of chips, so they come a step at a time.
const revealAllUpTo = 100;

interface InviteFieldLineProps {
  list: InviteList;
  check: InviteCheck;
}

/** One line under a field, saying what just happened to what was in it. Stays mounted, so a change is announced. */
export function InviteFieldLine({ list, check }: InviteFieldLineProps) {
  const { t } = useTranslation();
  const { last, typedInvalid, people } = list;
  const listed = last && !last.repeat && (list.emails.includes(last.address) || list.unparsed.includes(last.address)) ? last.address : null;

  const content = () => {
    if (typedInvalid) {
      return (
        <>
          <StatusDot tone="destructive" />
          <span className="min-w-0">
            <span className={cn('font-medium', tileTones.destructive.text)}>{t('c:invite_state_not_address')}</span>
            {` · ${lowercaseLabel(t('c:invite_state_check_spelling'))}`}
          </span>
        </>
      );
    }
    if (last?.repeat) return t('c:invite_already_listed', { address: last.address });
    if (listed) {
      const { tone, word, note, checking } = check.viewOf(listed);
      return (
        <>
          <StatusDot tone={tone} checking={checking} />
          <span className="min-w-0 break-all">
            <span className={cn('font-medium', tileTones[tone].text)}>{word}</span>
            {` · ${people.get(listed)?.name ?? listed}`}
            {note && ` · ${note}`}
          </span>
        </>
      );
    }
    return null;
  };

  return (
    <div role="status" className="flex items-baseline gap-1.5 text-muted-foreground text-sm">
      {content()}
    </div>
  );
}

interface EditableAddressProps {
  value: string;
  onFix: (text: string) => void;
}

/** A near-miss, corrected in place: Enter or leaving the field reads it again. */
function EditableAddress({ value, onFix }: EditableAddressProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);

  return (
    <Input
      aria-label={t('c:invite_fix_address', { address: value })}
      value={text}
      inputMode="email"
      autoCapitalize="none"
      spellCheck={false}
      className="focus-inset h-8 px-2"
      onChange={({ target }) => setText(target.value)}
      onBlur={() => onFix(text)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        onFix(text);
      }}
    />
  );
}

interface InviteChipProps {
  address: string;
  person?: InvitePerson;
  /** A date or reason beside the address. The tile carries the color. */
  fact?: string;
  onRemove: () => void;
}

/** An address as a plain chip. A long one wraps its fact under it and is never cut. */
function InviteChip({ address, person, fact, onRemove }: InviteChipProps) {
  const { t } = useTranslation();

  return (
    <Chip
      title={person ? address : undefined}
      className="h-auto min-h-6 rounded-xl"
      onRemove={onRemove}
      removeLabel={t('c:remove_resource', { resource: address })}
      start={
        person && <EntityAvatar type={person.entityType} className="size-6 text-xs" id={person.id} name={person.name} url={person.thumbnailUrl} />
      }
    >
      <span className="flex flex-wrap gap-x-1.5 whitespace-normal">
        <span className="break-all">{person?.name ?? address}</span>
        {fact && <span className="whitespace-nowrap text-muted-foreground">{fact}</span>}
      </span>
    </Chip>
  );
}

interface InviteGroupsProps {
  check: InviteCheck;
  list: InviteList;
  /** The invite waits for its draft channel's publish, which changes what a new address gets. */
  held: boolean;
}

/** A tile per outcome, with only the biggest problem open. A tile holds plain chips, a few at first and more on request. */
export function InviteGroups({ check, list, held }: InviteGroupsProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  const [picked, setPicked] = useState<{ key: string | null; revision: number } | null>(null);
  const [limits, setLimits] = useState<Partial<Record<InviteGroupKey, number>>>({});

  const present = inviteTiles.filter(({ key }) => check.groups[key].length);
  const biggest = present.find(({ key }) => key !== 'new')?.key ?? null;
  const open = picked?.revision === list.revision ? picked.key : biggest;

  // A removed chip unmounts its focused button, so focus goes to its tile's head, or to the form's field with the tile gone too
  const remove = (key: InviteGroupKey, address: string) => {
    const tile = rootRef.current?.querySelector<HTMLElement>(`[data-invite-tile="${key}"] button`);
    const next = check.groups[key].length > 1 ? tile : rootRef.current?.closest('form')?.querySelector<HTMLElement>('input, textarea, button');
    list.remove(address);
    next?.focus();
  };

  return (
    <Accordion
      ref={rootRef}
      value={open ? [open] : []}
      onValueChange={(value) => setPicked({ key: value[0] ?? null, revision: list.revision })}
      className="flex flex-col gap-3"
    >
      {present.map(({ key, summary, word, note, icon: Icon }) => {
        const addresses = check.groups[key];
        // A "+1" takes the room of the chip it hides
        const isLong = key !== 'fix' && addresses.length > firstChips + 1;
        const limit = isLong ? (limits[key] ?? firstChips) : addresses.length;
        const hidden = addresses.length - Math.min(limit, addresses.length);
        const step = hidden > revealAllUpTo ? revealStep : hidden;

        return (
          <div key={key} data-invite-tile={key}>
            <ExpandableTile
              value={key}
              className={key === 'fix' ? 'intent-destructive soft-border' : undefined}
              panelClassName="max-sm:pl-3"
              wrapMeta
              icon={<Icon className="text-muted-foreground" />}
              title={t(summary, { count: addresses.length })}
              status={{ tone: tileTone[key], label: t(word) }}
              meta={key === 'new' && held ? lowercaseLabel(t('c:invite_state_on_publish')) : lowercaseLabel(t(note))}
              lead={
                key === 'fix' ? (
                  addresses.map((address) => (
                    <div key={address} className="flex items-center gap-2">
                      <EditableAddress value={address} onFix={(text) => list.fix(address, text)} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('c:remove_resource', { resource: address })}
                        onClick={() => remove(key, address)}
                        className="size-8 shrink-0"
                      >
                        <XIcon />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {addresses.slice(0, limit).map((address) => (
                      <InviteChip
                        key={address}
                        address={address}
                        person={list.people.get(address)}
                        fact={check.viewOf(address).fact}
                        onRemove={() => remove(key, address)}
                      />
                    ))}
                    {isLong && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="auto"
                        press={false}
                        aria-label={hidden ? t('c:invite_show_more', { step, hidden }) : undefined}
                        onClick={() => setLimits({ ...limits, [key]: hidden ? limit + step : firstChips })}
                        className="h-6 rounded-full px-2.5"
                      >
                        {hidden ? `+${hidden}` : t('c:show_less')}
                      </Button>
                    )}
                  </div>
                )
              }
            />
          </div>
        );
      })}
    </Accordion>
  );
}
