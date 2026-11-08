import { BanIcon, CircleAlertIcon, MailIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lowercaseLabel } from 'shared/utils/i18n-text';
import type { TKey } from '~/lib/i18n-locales';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { ExpandableTile } from '~/modules/common/expandable-tile';
import type { IconComponent } from '~/modules/common/icons/types';
import { Accordion } from '~/modules/ui/accordion';
import { Button } from '~/modules/ui/button';
import { Chip } from '~/modules/ui/chip';
import { Input, skipPasswordManagers } from '~/modules/ui/input';
import type { InviteRole } from '~/modules/user/invite-submit';
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

/** A near-miss, corrected in place: Enter or leaving the field reads it again. */
function EditableAddress({ value, onFix }: { value: string; onFix: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);

  return (
    <Input
      aria-label={t('c:invite_fix_address', { address: value })}
      value={text}
      inputMode="email"
      autoCapitalize="none"
      spellCheck={false}
      {...skipPasswordManagers}
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
  /** A date or reason beside the address. */
  fact?: string;
  onRemove: () => void;
}

/** A long address wraps its fact under it. A person's chip shows the address on hover or press, as wide as the longer, so the row never moves. */
function InviteChip({ address, person, fact, onRemove }: InviteChipProps) {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  // A press shows its own result until the pointer leaves, past the hover's preview
  const [pressed, setPressed] = useState(false);
  const showsAddress = pinned || (hovered && !pressed);

  return (
    <Chip
      className="h-auto min-h-6 rounded-xl"
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onPress={
        person &&
        (() => {
          setPinned(!pinned);
          setPressed(true);
        })
      }
      pressLabel={person && t('c:invite_chip_person', { name: person.name, address })}
      onRemove={onRemove}
      removeLabel={t('c:remove_resource', { resource: address })}
      start={
        person && <EntityAvatar type={person.entityType} className="size-6 text-xs" id={person.id} name={person.name} url={person.thumbnailUrl} />
      }
    >
      <span className="flex flex-wrap gap-x-1.5 whitespace-normal">
        {person ? (
          <span className="inline-grid text-start break-all *:[grid-area:1/1]">
            <span className={cn(showsAddress && 'invisible')}>{person.name}</span>
            <span className={cn(!showsAddress && 'invisible')}>{address}</span>
          </span>
        ) : (
          <span className="break-all">{address}</span>
        )}
        {fact && <span className="text-muted-foreground whitespace-nowrap">{fact}</span>}
      </span>
    </Chip>
  );
}

interface InviteGroupsProps {
  check: InviteCheck;
  list: InviteList;
  /** The invite waits for its draft channel's publish, which changes what a new address gets. */
  held: boolean;
  /** The role a channel invite gives, which the new tile names. */
  role?: InviteRole;
}

/** A tile per outcome, with only the biggest problem open. A tile holds plain chips, a few at first and more on request. */
export function InviteGroups({ check, list, held, role }: InviteGroupsProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  const [picked, setPicked] = useState<{ key: string | null; revision: number } | null>(null);
  const [limits, setLimits] = useState<Partial<Record<InviteGroupKey, number>>>({});

  const present = inviteTiles.filter(({ key }) => check.groups[key].length);
  // The tile a single addition lands in, once checked: a paste, a restored draft or a mode switch leaves no last one
  const lastView = list.last && check.viewOf(list.last.address);
  const landed = lastView && !lastView.checking ? lastView.group : null;
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
              // The whole sentence rolls, since where the number sits depends on the language
              title={
                <span className="inline-grid">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={addresses.length}
                      className="[grid-area:1/1]"
                      initial={{ y: '100%', opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: '-100%', opacity: 0 }}
                    >
                      {key === 'new' && role
                        ? t('c:invite_summary_new_role', { count: addresses.length, role: t(`c:${role}`, { count: addresses.length }) })
                        : t(summary, { count: addresses.length })}
                    </motion.span>
                  </AnimatePresence>
                </span>
              }
              status={{ tone: tileTone[key], label: t(word), pulse: landed === key ? list.revision : undefined }}
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
