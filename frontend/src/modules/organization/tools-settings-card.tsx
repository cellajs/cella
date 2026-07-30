import { ChevronDownIcon, ChevronUpIcon, LockIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SlotToolsConfig } from 'shared/tools-config';
import { getSettingsAsideTools, orderByChannelConfig } from '~/lib/placements';
import { useOrganizationUpdateMutation } from '~/modules/organization/query';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { Switch } from '~/modules/ui/switch';

const slot = 'organization.settings.aside';

/**
 * Admin card arranging this organization's settings tools: toggle visibility and reorder, persisted
 * per organization in `toolsConfig`. Locked tools are listed but cannot be hidden.
 */
export function OrganizationToolsCard({ organization }: { organization: EnrichedOrganization }) {
  const { t } = useTranslation();
  const { mutate } = useOrganizationUpdateMutation();

  const slotConfig = organization.toolsConfig?.[slot];
  const hidden = new Set(slotConfig?.hidden ?? []);
  const tools = orderByChannelConfig(
    getSettingsAsideTools('organization').map((tool) => ({ ...tool, order: tool.order ?? 50 })),
    slotConfig,
  );

  const persist = (nextConfig: SlotToolsConfig) => {
    mutate({
      path: { tenantId: organization.tenantId, id: organization.id },
      body: { toolsConfig: { [slot]: nextConfig } },
    });
  };

  const toggleHidden = (id: string, visible: boolean) => {
    const nextHidden = tools.filter((tool) => (tool.id === id ? !visible : hidden.has(tool.id))).map((tool) => tool.id);
    persist({ order: tools.map((tool) => tool.id), hidden: nextHidden });
  };

  const move = (index: number, delta: number) => {
    const ids = tools.map((tool) => tool.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    persist({ order: ids, hidden: [...hidden] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('c:tools')}</CardTitle>
        <CardDescription>{t('c:tools.text')}</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
