import { FileTextIcon, LayoutListIcon, WorkflowIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import type { DocRenderMode } from '~/modules/page/content';

const renderModeIcons: Record<DocRenderMode, IconComponent> = { default: FileTextIcon, overview: LayoutListIcon, nodeOnly: WorkflowIcon };

/** Literal keys (not a template literal) so the typed-key check and the dead-key sweep both see them. */
const renderModeLabelKeys = {
  default: 'c:render_mode.default',
  overview: 'c:render_mode.overview',
  nodeOnly: 'c:render_mode.node_only',
} as const satisfies Record<DocRenderMode, TKey>;

interface RenderModeLabelProps {
  mode: DocRenderMode;
}

export function RenderModeLabel({ mode }: RenderModeLabelProps) {
  const { t } = useTranslation();
  const Icon = renderModeIcons[mode];
  return (
    <span className="flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{t(renderModeLabelKeys[mode])}</span>
    </span>
  );
}
