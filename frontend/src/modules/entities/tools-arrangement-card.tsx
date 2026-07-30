import { ChevronDownIcon, ChevronUpIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlotToolsConfig, ToolsConfig } from 'shared/tools-config';
import { getChannelSettingsTools, orderBySlotConfig } from '~/lib/placements';
import { ToolCard } from '~/modules/common/tool-card';
import type { EnrichedChannel } from '~/modules/entities/types';
import { Button } from '~/modules/ui/button';
import { Switch } from '~/modules/ui/switch';

interface ToolsArrangementCardProps {
  /** The hosting channel entity; slot and stored arrangement derive from it. */
  entity: EnrichedChannel & { toolsConfig?: ToolsConfig };
  /** Persists the next toolsConfig through the channel's update mutation. */
  persist: (toolsConfig: ToolsConfig) => void;
}

/**
 * Admin card arranging a channel's settings tools: toggle visibility and reorder, persisted per
 * channel in `toolsConfig`. Locked tools are listed but cannot be hidden. Channel-agnostic: the
 * hosting module wires `persist` to its entity's update mutation.
 */
export function ToolsArrangementCard({ entity, persist }: ToolsArrangementCardProps) {
  const { t } = useTranslation();

  const slot = `${entity.entityType}.settings`;
  const slotConfig = entity.toolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);
  const tools = orderBySlotConfig(
    getChannelSettingsTools(entity.entityType).map((tool) => ({ ...tool, order: tool.order ?? 50 })),
    slotConfig,
  );

  const persistSlot = (nextConfig: SlotToolsConfig) => persist({ [slot]: nextConfig });

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = tools.filter((tool) => (tool.id === id ? !visible : hidden.has(tool.id))).map((tool) => tool.id);
    persistSlot({ order: tools.map((tool) => tool.id), hidden: nextHidden });
  };

  const move = (index: number, delta: number) => {
    const ids = tools.map((tool) => tool.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persistSlot({ order: ids, hidden: [...hidden] });
  };

  return (
    <ToolCard label="c:tools" description={t('c:tools.text')}>
      <ul className="flex flex-col gap-1">
        {tools.map((tool, index) => (
          <li key={tool.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
            <span className="grow truncate text-sm">
              {t(tool.label, { resource: t(tool.resource || '').toLowerCase() })}
            </span>
            <Button
              variant="ghost"
              size="xs"
              aria-label={t('c:move_up')}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ChevronUpIcon className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              aria-label={t('c:move_down')}
              disabled={index === tools.length - 1}
              onClick={() => move(index, 1)}
            >
              <ChevronDownIcon className="size-4" />
            </Button>
            {tool.locked ? (
              <LockIcon className="size-4 shrink-0 opacity-50" aria-label={t('c:locked')} />
            ) : (
              <Switch checked={!hidden.has(tool.id)} onCheckedChange={(visible) => toggleHidden(tool.id, visible)} />
            )}
          </li>
        ))}
      </ul>
    </ToolCard>
  );
}
