import { BirdIcon, BracesIcon, FileTypeIcon, TextAlignStartIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenRequest, GenSchema } from 'sdk/docs-types';
import type { IconComponent } from '~/modules/common/icons/types';
import { JsonViewer } from '~/modules/common/json-viewer/json-viewer';
import { hasDescriptionKeyword } from '~/modules/common/json-viewer/utils';
import { HelpToggle } from '~/modules/ui/help-toggle';
import { SegmentedControl, SegmentedControlItem } from '~/modules/ui/segmented-control';
import { lazyNamed } from '~/utils/lazy-named';

// Lazy: shiki and its grammars load when the code view opens, not with the docs route.
const CodeViewer = lazyNamed(() => import('~/modules/docs/code-viewer'), 'CodeViewer');

type SchemaViewMode = 'format' | 'zod' | 'type' | 'example';

interface ViewerGroupProps {
  schema: GenSchema | GenRequest;
  /** Code to display in zod mode */
  zodCode?: string;
  /** Code to display in type mode */
  typeCode?: string;
  /** Example JSON to display in example mode */
  example?: unknown;
  defaultInspectDepth?: number;
  defaultViewMode?: SchemaViewMode;
  /** Hides the schema's descriptions behind a help toggle, which shows only when the schema has any. */
  descriptionToggle?: boolean;
}

export function ViewerGroup({
  schema,
  zodCode,
  typeCode,
  example,
  defaultInspectDepth = 5,
  defaultViewMode = 'format',
  descriptionToggle,
}: ViewerGroupProps) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<SchemaViewMode>(defaultViewMode);
  const [descriptionsOpen, setDescriptionsOpen] = useState(false);

  const toggleItems: { value: SchemaViewMode; icon: IconComponent; label: string; ariaLabel: string; show: boolean }[] = [
    { value: 'format', icon: TextAlignStartIcon, label: t('c:docs.format'), ariaLabel: t('c:docs.view_format'), show: true },
    { value: 'example', icon: BirdIcon, label: t('c:example'), ariaLabel: t('c:docs.view_example'), show: example !== undefined },
    { value: 'zod', icon: BracesIcon, label: t('c:docs.zod'), ariaLabel: t('c:docs.view_zod'), show: !!zodCode },
    { value: 'type', icon: FileTypeIcon, label: t('c:type'), ariaLabel: t('c:docs.view_type'), show: !!typeCode },
  ];

  return (
    // Isolated: the controls' z-index orders them over the panel only, a pinned bar paints over both
    <div className="relative isolate">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5">
        {descriptionToggle && viewMode === 'format' && hasDescriptionKeyword(schema) && (
          <HelpToggle open={descriptionsOpen} onToggle={() => setDescriptionsOpen(!descriptionsOpen)} className="size-7" />
        )}
        <SegmentedControl value={viewMode} onValueChange={setViewMode} size="xs" className="border-transparent max-md:hidden">
          {toggleItems
            .filter((item) => item.show)
            .map(({ value, icon: Icon, label, ariaLabel }) => (
              <SegmentedControlItem key={value} value={value} aria-label={ariaLabel}>
                <Icon />
                {label}
              </SegmentedControlItem>
            ))}
        </SegmentedControl>
      </div>
      <div className="overflow-x-auto rounded-md bg-muted/50">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="p-3 md:py-4"
          >
            {viewMode === 'format' && (
              <JsonViewer
                value={schema}
                showKeyQuotes={false}
                openapiMode="schema"
                rootName={false}
                defaultInspectDepth={defaultInspectDepth}
                indentWidth={3}
                hideDescriptions={descriptionToggle && !descriptionsOpen}
              />
            )}
            <Suspense fallback={null}>
              {viewMode === 'zod' && zodCode && <CodeViewer code={zodCode} />}
              {viewMode === 'type' && typeCode && <CodeViewer code={typeCode} />}
            </Suspense>
            {viewMode === 'example' && example !== undefined && (
              <JsonViewer value={example} rootName={false} defaultInspectDepth={defaultInspectDepth} indentWidth={3} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
