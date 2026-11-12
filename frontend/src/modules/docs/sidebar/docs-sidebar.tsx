import { Link } from '@tanstack/react-router';
import { PencilIcon, SearchIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { LogoMark } from '~/modules/common/logo-art';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { openDocsSearch } from '~/modules/docs/search/open-docs-search';
import { ApiReferenceSection } from '~/modules/docs/sidebar/api-reference-section';
import { DocsSidebarSection } from '~/modules/docs/sidebar/docs-sidebar-section';
import { closeSidebarSheetAndNavigate } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { PagesSidebar } from '~/modules/docs/sidebar/pages-sidebar';
import { UserTheme } from '~/modules/me/user-theme';
import { docsConfig, useVisibleDocPages } from '~/modules/page/content';
import { Button } from '~/modules/ui/button';
import { SidebarContent } from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';

/** Sidebar section with the docs pages tree (plus the admin manage-pages shortcut). */
function PagesSection({ label }: { label: string }) {
  const { t } = useTranslation();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);

  return (
    <DocsSidebarSection
      label={label}
      action={
        isSystemAdmin && (
          <TooltipButton toolTipContent={t('c:manage_pages')} side="right">
            <Button variant="ghost" size="xs" className="h-7 w-8 p-0" render={<Link to="/docs/pages" onClick={closeSidebarSheetAndNavigate} />}>
              <PencilIcon className="size-3.5" />
            </Button>
          </TooltipButton>
        )
      }
    >
      <PagesSidebar />
    </DocsSidebarSection>
  );
}

const pagesSectionShown = docsConfig.sections.some((section) => section.id === 'pages' && section.visible);

function LinksSection({ label }: { label: string }) {
  const { t } = useTranslation();
  const contactRef = useRef<HTMLButtonElement>(null);
  const hasStatusPage = !!appConfig.statusUrl.trim();
  // A changelog page an app leaves unhidden is already a row of the pages tree.
  const changelogInTree = useVisibleDocPages().some((page) => page.id === 'changelog') && pagesSectionShown;

  return (
    <DocsSidebarSection label={label}>
      {!changelogInTree && (
        <Button
          variant="ghost"
          className="w-full justify-start"
          render={<Link to="/docs/page/$" params={{ _splat: 'changelog' }} onClick={closeSidebarSheetAndNavigate} />}
        >
          {t('c:changelog')}
        </Button>
      )}

      {hasStatusPage && (
        <Button variant="ghost" className="w-full justify-start" onClick={() => window.open(appConfig.statusUrl, '_blank', 'noopener,noreferrer')}>
          {t('c:status')}
        </Button>
      )}

      <Button ref={contactRef} variant="ghost" className="w-full justify-start" onClick={() => contactFormHandler(contactRef)}>
        {t('c:contact_us')}
      </Button>

      <Button variant="ghost" className="w-full justify-start" render={<Link to="/docs/overview" onClick={closeSidebarSheetAndNavigate} />}>
        openapi.json
      </Button>

      <Button variant="ghost" className="w-full justify-start" render={<a href="/llms.txt" target="_blank" rel="noreferrer" />}>
        llms.txt
      </Button>
    </DocsSidebarSection>
  );
}

const sectionComponents = { apiReference: ApiReferenceSection, pages: PagesSection, links: LinksSection };

/** The sections `docsConfig` lists, in their array order; one with `visible: false` is left out. */
export function DocsSidebar() {
  const { t } = useTranslation();
  const searchTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <SidebarContent className="min-h-dvh flex-none overflow-visible pt-2 pb-12">
      <div aria-hidden="true" className="bg-card sticky top-0 z-20 -mb-4 h-2" />

      <div className="my-2 flex items-center gap-2 px-4 pt-2">
        <TooltipButton toolTipContent={t('c:go_to_about')}>
          <Link
            to="/about"
            draggable={false}
            className="focus-effect active:press ml-1 flex h-8 items-center rounded-md transition-transform hover:scale-105"
            onClick={closeSidebarSheetAndNavigate}
          >
            <LogoMark className="size-7" />
          </Link>
        </TooltipButton>
        {/* 0.75rem each side: the Docs link's own padding adds to the gap after the line */}
        <div aria-hidden="true" className="bg-foreground/15 more-contrast:bg-foreground/40 ml-1 h-6 w-px" />
        <TooltipButton toolTipContent={t('c:go_to_docs')}>
          <Link
            to="/docs"
            draggable={false}
            className="focus-effect flex h-8 items-center rounded-md px-1 text-lg font-medium transition-opacity hover:opacity-70"
            onClick={closeSidebarSheetAndNavigate}
          >
            {t('c:docs')}
          </Link>
        </TooltipButton>
        <div className="ml-auto flex items-center gap-1">
          <TooltipButton toolTipContent={t('c:search')}>
            <Button ref={searchTriggerRef} variant="ghost" size="icon-sm" onClick={() => openDocsSearch(searchTriggerRef)}>
              <SearchIcon className="size-5" />
            </Button>
          </TooltipButton>
          <UserTheme buttonClassName="size-9" tooltip />
        </div>
      </div>

      {docsConfig.sections
        .filter((section) => section.visible)
        .map((section) => {
          const Section = sectionComponents[section.id];
          return <Section key={section.id} label={section.label} />;
        })}
    </SidebarContent>
  );
}
