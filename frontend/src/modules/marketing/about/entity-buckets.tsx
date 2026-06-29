import {
  ArrowRightIcon,
  Building2Icon,
  CheckSquareIcon,
  FileTextIcon,
  FolderKanbanIcon,
  HashIcon,
  LayoutGridIcon,
  type LucideIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PaperclipIcon,
  TagIcon,
  UserIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

// A conceptual illustration of Cella's selective sync: structural entities (no sync) and
// content entities (opt-in sync) both live in the same REST/Postgres/React Query foundation.
// The wrapper is an open-top "U" to signal this is conceptual, not a closed system. A toggle
// swaps between example app configs to show the same split holds for different entity setups.

type Entity = { Icon: LucideIcon; label: string };

type AppConfig = { label: string; noSync: Entity[]; synced: Entity[] };

// Each config keeps a structural "No sync" bucket (users/org + a context entity) and a
// "Synced" bucket of high-frequency collaborative content typical for that kind of app.
const configs: Record<string, AppConfig> = {
  todo: {
    label: 'about:entity_buckets.config_todo',
    noSync: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: FolderKanbanIcon, label: 'about:entity_buckets.projects' },
    ],
    synced: [
      { Icon: CheckSquareIcon, label: 'about:entity_buckets.tasks' },
      { Icon: TagIcon, label: 'about:entity_buckets.labels' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
  docs: {
    label: 'about:entity_buckets.config_docs',
    noSync: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: LayoutGridIcon, label: 'about:entity_buckets.spaces' },
    ],
    synced: [
      { Icon: FileTextIcon, label: 'about:entity_buckets.pages' },
      { Icon: MessageSquareIcon, label: 'about:entity_buckets.comments' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
  chat: {
    label: 'about:entity_buckets.config_chat',
    noSync: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: HashIcon, label: 'about:entity_buckets.channels' },
    ],
    synced: [
      { Icon: MessageCircleIcon, label: 'about:entity_buckets.chats' },
      { Icon: MessageSquareIcon, label: 'about:entity_buckets.messages' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
};

type ConfigKey = keyof typeof configs;
const configOrder: ConfigKey[] = ['todo', 'docs', 'chat'];

// On config switch the whole group fades out first (mode="wait"), then tiles fade + pop in,
// staggered, for a lively but clean reveal.
const tileVariants = {
  initial: { opacity: 0, scale: 0.8 },
  enter: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 20 } },
} as const;

// Single entity: icon over label. Stacks one-per-line on mobile, sits in a row on larger screens.
const EntityTile = ({ Icon, label }: Entity) => {
  const { t } = useTranslation();
  return (
    <motion.div variants={tileVariants} className="flex w-full min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl bg-background sm:size-14">
        <Icon className="size-5 text-foreground sm:size-7" strokeWidth={1.5} />
      </div>
      <div className="w-full truncate text-muted-foreground text-xs">{t(label)}</div>
    </motion.div>
  );
};

// Dashed primary border, echoing the flowing dashes in the sync diagram. Measured in real
// pixels so the rounded rect tracks the card at any breakpoint. `animated` makes the dashes flow.
const DashedBorder = ({ animated = false }: { animated?: boolean }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
      {size.w > 0 && (
        <motion.rect
          x={1}
          y={1}
          width={size.w - 2}
          height={size.h - 2}
          rx={15}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1}
          strokeLinecap="round"
          strokeDasharray={animated ? '6 6' : '0.1 5'}
          animate={animated ? { strokeDashoffset: [0, -12] } : { strokeDashoffset: 0 }}
          transition={animated ? { repeat: Number.POSITIVE_INFINITY, ease: 'linear', duration: 0.6 } : { duration: 0 }}
        />
      )}
    </svg>
  );
};

// One category card. Both buckets get a dashed primary border; `animated` makes the synced
// bucket's dashes flow. Entities crossfade (keyed by config) when the active app config changes.
const Bucket = ({
  title,
  config,
  entities,
  animated = false,
}: {
  title: string;
  config: ConfigKey;
  entities: Entity[];
  animated?: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-w-0 flex-col rounded-2xl bg-background px-2 py-4 sm:px-6 sm:py-6">
      <DashedBorder animated={animated} />
      <h3 className="mb-4 text-center font-semibold text-foreground text-xs sm:text-base">{t(title)}</h3>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={config}
          initial="initial"
          animate="enter"
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          variants={{ enter: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:justify-around sm:gap-2"
        >
          {entities.map((entity) => (
            <EntityTile key={entity.label} {...entity} />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

/**
 * Conceptual two-bucket illustration of selective sync, wrapped in an open-top container.
 * A toggle swaps between example app configs to show the split holds for different setups.
 */
export const EntityBuckets = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConfigKey>('todo');
  // "Try me" hint nudges the user to interact; hidden as soon as they switch config.
  const [hint, setHint] = useState(true);
  const active = configs[config];

  return (
    <div className="mx-auto mt-4 mb-4 flex w-full max-w-3xl flex-col items-center">
      {/* App-config toggle — swaps which entities populate the buckets */}
      <div className="relative mb-6">
        {hint && (
          <div className="absolute top-1/2 right-full mr-3 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap text-muted-foreground text-sm max-sm:hidden">
            {t('about:try_me')}
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', duration: 1 }}
            >
              <ArrowRightIcon size={16} />
            </motion.span>
          </div>
        )}
        <ToggleGroup
          type="single"
          value={config}
          onValueChange={(value) => {
            if (value) {
              setConfig(value as ConfigKey);
              setHint(false);
            }
          }}
          variant="merged"
        >
          {configOrder.map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {t(configs[key].label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {/* Open-top "U": only side and bottom walls — a conceptual, not closed, boundary */}
      <div className="w-full rounded-b-3xl border-primary border-x border-b px-2 pt-6 pb-4 sm:px-6 sm:pt-6 sm:pb-8">
        <div className="grid grid-cols-2 gap-2 sm:gap-6">
          <Bucket title="about:entity_buckets.no_sync" config={config} entities={active.noSync} />
          <Bucket title="about:entity_buckets.synced" config={config} entities={active.synced} animated />
        </div>
        {/* Foundation caption sits on the floor of the U: covers everything above it */}
        <p className="mt-5 text-center font-medium text-xs sm:mt-8 sm:text-sm">
          {t('about:entity_buckets.foundation')}
        </p>
      </div>
    </div>
  );
};
