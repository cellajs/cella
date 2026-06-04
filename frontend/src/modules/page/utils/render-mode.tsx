import { FileTextIcon, LayoutListIcon, type LucideIcon, WorkflowIcon } from 'lucide-react';
import type { Page } from 'sdk';

type RenderMode = NonNullable<Page['renderMode']>;

export const renderModeIcons: Record<RenderMode, LucideIcon> = {
  default: FileTextIcon,
  overview: LayoutListIcon,
  nodeOnly: WorkflowIcon,
};

export const renderModeLabelKey = (mode: string) => `c:render_mode.${mode === 'nodeOnly' ? 'node_only' : mode}`;

interface RenderModeLabelProps {
  mode: RenderMode;
  label: string;
  iconSize?: number;
  className?: string;
}

export function RenderModeLabel({
  mode,
  label,
  iconSize = 14,
  className = 'flex items-center gap-1.5',
}: RenderModeLabelProps) {
  const Icon = renderModeIcons[mode] ?? FileTextIcon;
  return (
    <span className={className}>
      <Icon size={iconSize} className="shrink-0 text-muted-foreground" />
      <span className="truncate">{label}</span>
    </span>
  );
}
