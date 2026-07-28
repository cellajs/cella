import { FileTextIcon, LayoutListIcon, WorkflowIcon } from 'lucide-react';
import type { IconComponent } from '~/modules/common/icons/types';
import type { DocRenderMode } from '~/modules/page/content';

/** Maps render mode values to icons. */
export const renderModeIcons: Record<DocRenderMode, IconComponent> = {
  default: FileTextIcon,
  overview: LayoutListIcon,
  nodeOnly: WorkflowIcon,
};

/** Returns the translation key for a documentation render mode. */
export const renderModeLabelKey = (mode: string) => `c:render_mode.${mode === 'nodeOnly' ? 'node_only' : mode}`;

interface RenderModeLabelProps {
  mode: DocRenderMode;
  label: string;
  className?: string;
}

/** Renders the render mode label component. */
export function RenderModeLabel({ mode, label, className = 'flex items-center gap-1.5' }: RenderModeLabelProps) {
  const Icon = renderModeIcons[mode] ?? FileTextIcon;
  return (
    <span className={className}>
      <Icon className="icon-sm shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}
