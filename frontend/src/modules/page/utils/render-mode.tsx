import { FileTextIcon, LayoutListIcon, WorkflowIcon } from 'lucide-react';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import type { DocRenderMode } from '~/modules/page/content';

export const renderModeIcons: Record<DocRenderMode, IconComponent> = {
  default: FileTextIcon,
  overview: LayoutListIcon,
  nodeOnly: WorkflowIcon,
};

export const renderModeLabelKey = (mode: string) => `c:render_mode.${mode === 'nodeOnly' ? 'node_only' : mode}` as TKey;

interface RenderModeLabelProps {
  mode: DocRenderMode;
  label: string;
  className?: string;
}

export function RenderModeLabel({ mode, label, className = 'flex items-center gap-1.5' }: RenderModeLabelProps) {
  const Icon = renderModeIcons[mode] ?? FileTextIcon;
  return (
    <span className={className}>
      <Icon className="icon-sm shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}
