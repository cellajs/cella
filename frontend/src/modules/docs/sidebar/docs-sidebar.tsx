import { Link } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { Logo } from '~/modules/common/logo';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { openDocsSearch } from '~/modules/docs/search/open-docs-search';
import { ApiReferenceSection } from '~/modules/docs/sidebar/api-reference-section';
import { LinksSection } from '~/modules/docs/sidebar/links-section';
import { PagesSection } from '~/modules/docs/sidebar/pages-section';
import type { GenTagSummary } from '~/modules/docs/types';
import { UserTheme } from '~/modules/me/user-theme';
import { docsConfig } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { SidebarContent } from '~/modules/ui/sidebar';
import { lazyNamed } from '~/utils/lazy-named';

const DebugDropdown =
  appConfig.mode !== 'production'
    ? lazyNamed(() => import('~/modules/common/debug-dropdown'), 'DebugDropdown')
    : () => null;

interface DocsSidebarProps {
  tags: GenTagSummary[];
}

/**
 * Docs sidebar: logo + theme, then sections from the global docs config (content root index.mdx
 * frontmatter) — label, order, visibility are config-driven; each section id maps to a renderer.
 */
export function DocsSidebar({ tags }: DocsSidebarProps) {
  const { t } = useTranslation();
  const isMobile = useBreakpointBelow('sm', false);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  const closeSheet = () => {
    if (!isMobile) return;
    useSheeter.getState().remove();
  };

  return (
    <SidebarContent className="min-h-screen flex-none overflow-visible bg-card pt-2 pb-24">
      <div aria-hidden="true" className="sticky top-0 z-20 -mb-4 h-2 shrink-0 bg-card" data-slot="sticky-mask" />

      <div className="my-2 flex items-center gap-2 px-4 pt-2">
        <Link
          to="/about"
          draggable={false}
          className="focus-effect ml-1 flex h-8 items-center rounded-md transition-transform hover:scale-105 active:scale-100"
          aria-label="Go to homepage"
          onClick={closeSheet}
        >
          <Logo iconOnly height={28} />
        </Link>
        <div aria-hidden="true" className="h-5 w-px bg-border" />
        <Link
          to="/docs"
          draggable={false}
          className="focus-effect flex h-8 items-center rounded-md px-1 font-medium transition-opacity hover:opacity-70"
          onClick={closeSheet}
        >
          Docs
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <Button
            ref={searchTriggerRef}
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={t('c:search')}
            onClick={() => openDocsSearch(searchTriggerRef)}
          >
            <SearchIcon className="icon-lg" />
          </Button>
          <UserTheme buttonClassName="size-9" />
        </div>
      </div>

      {/* Config-driven sections (pre-sorted by order in content.ts) */}
      {docsConfig.sections
        .filter((section) => section.visible)
        .map((section) => {
          switch (section.id) {
            case 'apiReference':
              return <ApiReferenceSection key={section.id} label={section.label} tags={tags} isMobile={isMobile} />;
            case 'pages':
              return <PagesSection key={section.id} label={section.label} onClose={closeSheet} />;
            case 'links':
              return <LinksSection key={section.id} label={section.label} onClose={closeSheet} />;
            default:
              return null;
          }
        })}

      {/* Debug Toolbars */}
      <Suspense>{DebugDropdown ? <DebugDropdown className="absolute bottom-0 m-1" /> : null}</Suspense>
    </SidebarContent>
  );
}
