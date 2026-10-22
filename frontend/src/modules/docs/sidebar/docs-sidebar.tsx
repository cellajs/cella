import { Link } from '@tanstack/react-router';
import { SearchIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Logo } from '~/modules/common/logo';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { openDocsSearch } from '~/modules/docs/search/open-docs-search';
import { ApiReferenceSection } from '~/modules/docs/sidebar/api-reference-section';
import { closeSidebarSheetAndNavigate } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { LinksSection } from '~/modules/docs/sidebar/links-section';
import { PagesSection } from '~/modules/docs/sidebar/pages-section';
import { UserTheme } from '~/modules/me/user-theme';
import { docsConfig } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { SidebarContent } from '~/modules/ui/sidebar';

/** Sections come from the global docs config (content root index.mdx frontmatter): label, order, visibility. */
export function DocsSidebar() {
  const { t } = useTranslation();
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <SidebarContent className="min-h-dvh flex-none overflow-visible bg-card pt-2 pb-12">
      <div aria-hidden="true" className="sticky top-0 z-20 -mb-4 h-2 shrink-0 bg-card" data-slot="sticky-mask" />

      <div className="my-2 flex items-center gap-2 px-4 pt-2">
        <TooltipButton toolTipContent={t('c:go_to_about')}>
          <Link
            to="/about"
            draggable={false}
            className="focus-effect active:press ml-1 flex h-8 items-center rounded-md transition-transform hover:scale-105"
            aria-label={t('c:go_to_about')}
            onClick={closeSidebarSheetAndNavigate}
          >
            <Logo iconOnly height={28} title={null} />
          </Link>
        </TooltipButton>
        <div aria-hidden="true" className="h-5 w-px bg-border" />
        <TooltipButton toolTipContent={t('c:go_to_docs')}>
          <Link
            to="/docs"
            draggable={false}
            className="focus-effect flex h-8 items-center rounded-md px-1 font-medium transition-opacity hover:opacity-70"
            onClick={closeSidebarSheetAndNavigate}
          >
            {t('c:docs')}
          </Link>
        </TooltipButton>
        <div className="ml-auto flex items-center gap-1">
          <TooltipButton toolTipContent={t('c:search')}>
            <Button
              ref={searchTriggerRef}
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={t('c:search')}
              onClick={() => openDocsSearch(searchTriggerRef)}
            >
              <SearchIcon className="size-5" />
            </Button>
          </TooltipButton>
          <UserTheme buttonClassName="size-9" tooltip />
        </div>
      </div>

      {/* Sections are pre-sorted by order in content.ts */}
      {docsConfig.sections
        .filter((section) => section.visible)
        .map((section) => {
          switch (section.id) {
            case 'apiReference':
              return <ApiReferenceSection key={section.id} label={section.label} />;
            case 'pages':
              return <PagesSection key={section.id} label={section.label} />;
            case 'links':
              return <LinksSection key={section.id} label={section.label} />;
            default:
              return null;
          }
        })}
    </SidebarContent>
  );
}
