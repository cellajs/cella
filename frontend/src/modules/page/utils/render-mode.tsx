import { FileTextIcon, LayoutListIcon, WorkflowIcon } from 'lucide-react';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import type { DocRenderMode } from '~/modules/page/content';

export const renderModeIcons: Record<DocRenderMode, IconComponent> = {
  default: FileTextIcon,
  overview: LayoutListIcon,
  nodeOnly: WorkflowIcon,
};

/** Literal keys (not a template literal) so the typed-key check and the dead-key sweep both see them. */
const renderModeLabelKeys = {
  default: 'c:render_mode.default',
  overview: 'c:render_mode.overview',
  nodeOnly: 'c:render_mode.node_only',
} as const satisfies Record<DocRenderMode, TKey>;

export const renderModeLabelKey = (mode: DocRenderMode): TKey => renderModeLabelKeys[mode];

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
