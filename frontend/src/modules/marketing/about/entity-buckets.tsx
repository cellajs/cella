import {
  ArrowRightIcon,
  Building2Icon,
  FileTextIcon,
  FolderKanbanIcon,
  HashIcon,
  LayoutGridIcon,
  type LucideIcon,
  MessageCircleIcon,
  MessageSquareIcon,
  PaperclipIcon,
  SquareCheckBigIcon,
  TagIcon,
  UserIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '~/modules/ui/toggle-group';

// A conceptual illustration of Cella's selective sync: context entities (structural, no sync)
// and product entities (opt-in sync) both live in the same REST/Postgres/React Query foundation.
// The wrapper is an open-top "U" to signal this is conceptual, not a closed system. A toggle
// swaps between example app configs to show the same split holds for different entity setups.

type Entity = { Icon: LucideIcon; label: string };

type AppConfig = { label: string; context: Entity[]; product: Entity[] };

// Each config keeps a structural "Context entities" bucket (users/org + a context entity) and a
// synced "Product entities" bucket of high-frequency collaborative content typical for that app.
const configs: Record<string, AppConfig> = {
  todo: {
    label: 'about:entity_buckets.config_todo',
    context: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: FolderKanbanIcon, label: 'about:entity_buckets.projects' },
    ],
    product: [
      { Icon: SquareCheckBigIcon, label: 'about:entity_buckets.tasks' },
      { Icon: TagIcon, label: 'about:entity_buckets.labels' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
  docs: {
    label: 'about:entity_buckets.config_docs',
    context: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: LayoutGridIcon, label: 'about:entity_buckets.spaces' },
    ],
    product: [
      { Icon: FileTextIcon, label: 'about:entity_buckets.pages' },
      { Icon: MessageSquareIcon, label: 'about:entity_buckets.comments' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
  chat: {
    label: 'about:entity_buckets.config_chat',
    context: [
      { Icon: UserIcon, label: 'about:entity_buckets.users' },
      { Icon: Building2Icon, label: 'about:entity_buckets.organizations' },
      { Icon: HashIcon, label: 'about:entity_buckets.channels' },
    ],
    product: [
      { Icon: MessageCircleIcon, label: 'about:entity_buckets.chats' },
      { Icon: MessageSquareIcon, label: 'about:entity_buckets.messages' },
      { Icon: PaperclipIcon, label: 'about:entity_buckets.attachments' },
    ],
  },
};

type ConfigKey = keyof typeof configs;
const configOrder: ConfigKey[] = ['todo', 'docs', 'chat'];

// Gap between tiles popping in on a config switch, so replaced tiles reveal one by one.
const ENTER_STAGGER = 0.15;

// Single entity: icon over label. Stacks one-per-line on mobile, sits in a row on larger screens.
// `delay` sets the tile's place in the one-by-one reveal when it enters after a config switch.
const EntityTile = ({ Icon, label, delay = 0 }: Entity & { delay?: number }) => {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 380, damping: 20, delay } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="flex w-full min-w-0 flex-1 flex-col items-center gap-2 text-center"
    >
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
// bucket's dashes flow and `badge` pins a pill label onto the middle of that border's top edge.
// On config switch, tiles whose entity persists across configs (users, organizations, ...) stay
// put; only slots whose entity actually changed crossfade, entering one by one.
const Bucket = ({
  title,
  entities,
  animated = false,
  badge,
  staggerOffset = 0,
}: {
  title: string;
  entities: Entity[];
  animated?: boolean;
  badge?: string;
  // Tiles revealing in other buckets before this one, so the one-by-one order spans buckets.
  staggerOffset?: number;
}) => {
  const { t } = useTranslation();
  // Previous render's entities, to detect which slots changed and stagger only those.
  const prevRef = useRef<Entity[]>(entities);
  const prev = prevRef.current;
  useEffect(() => {
    prevRef.current = entities;
  });
  let changed = 0;
  const delays = entities.map((entity, i) =>
    prev[i]?.label !== entity.label ? ENTER_STAGGER * (staggerOffset + changed++) : 0,
  );

  return (
    <div className="relative flex min-w-0 flex-col rounded-2xl bg-background px-2 py-4 sm:px-6 sm:py-6">
      <DashedBorder animated={animated} />
      {badge && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground text-xs">
          {t(badge)}
        </div>
      )}
      <h3 className="mb-4 text-center font-semibold text-foreground text-xs sm:text-base">{t(title)}</h3>
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-5 sm:flex-row sm:justify-around sm:gap-2">
        {entities.map((entity, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: slots are positional; the tile inside is keyed by entity label
          <AnimatePresence key={i} mode="wait" initial={false}>
            <EntityTile key={entity.label} {...entity} delay={delays[i]} />
          </AnimatePresence>
        ))}
      </div>
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
              <ArrowRightIcon />
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
          <Bucket title="about:entity_buckets.context_entities" entities={active.context} />
          {/* Context bucket always swaps exactly one tile, so this bucket's reveal starts one slot later */}
          <Bucket
            title="about:entity_buckets.product_entities"
            entities={active.product}
            animated
            badge="about:entity_buckets.synced"
            staggerOffset={1}
          />
        </div>
        {/* Foundation caption sits on the floor of the U: covers everything above it */}
        <p className="mt-5 text-center font-medium text-xs sm:mt-8 sm:text-sm">
          {t('about:entity_buckets.foundation')}
        </p>
      </div>
    </div>
  );
};
