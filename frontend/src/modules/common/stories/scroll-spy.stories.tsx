import type { Meta, StoryObj } from '@storybook/react-vite';
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from '@tanstack/react-router';
import { Bookmark, Info, Settings, Shield, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { getSection, scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

/**
 * Scroll spy test bed — each story runs in its own Storybook iframe
 * with isolated `window`, `history`, and `location`.
 *
 * Open in **Canvas** tab (not Docs) for proper iframe isolation.
 */

// ─── Shared types & data ─────────────────────────────────────────────────────

interface SidebarTab {
  id: string;
  label: string;
  icon: React.ElementType;
}

const tabs: SidebarTab[] = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'details', label: 'Details', icon: Info },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
  { id: 'delete-section', label: 'Delete', icon: Trash2 },
];

// ─── AsideAnchor (mirrors ~/modules/common/aside-anchor.tsx) ─────────────────

const AsideAnchor = ({
  id,
  children,
  extraOffset,
}: {
  id: string;
  children?: React.ReactNode;
  extraOffset?: boolean;
}) => (
  <div id={`spy-${id}-anchor-wrap`} className="last:mb-12 md:last:mb-[70vh]">
    <div id={`spy-${id}`} className={cn('absolute w-[.05rem]', extraOffset ? '-mt-16 h-16' : '-mt-8 h-8')} />
    {children}
  </div>
);

// ─── Section card ────────────────────────────────────────────────────────────

const SectionCard = ({ id, title, lines = 8 }: { id: string; title: string; lines?: number }) => (
  <AsideAnchor id={id} extraOffset>
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-xl">{title}</h2>
      {Array.from({ length: lines }, (_, i) => (
        <p key={i} className="mb-3 text-muted-foreground leading-relaxed">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore
          magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.
        </p>
      ))}
    </div>
  </AsideAnchor>
);

// ─── Sidebar variants ────────────────────────────────────────────────────────

/** Production-like sidebar: Button render={<Link>} with onClick preventDefault + scrollToSectionById */
const SidebarWithRouter = () => (
  <div className="flex w-full flex-col gap-1">
    {tabs.map(({ id, label, icon: Icon }) => (
      <Button
        key={id}
        variant="ghost"
        size="lg"
        data-spy-link={id}
        className={cn(
          'w-full justify-start text-left hover:bg-accent/50',
          id.includes('delete') && 'text-red-600',
          'data-spy-active:bg-secondary',
        )}
        render={
          <Link
            to="."
            hash={id}
            draggable={false}
            onClick={(e) => {
              e.preventDefault();
              scrollToSectionById(id);
            }}
            replace
          />
        }
      >
        <Icon className="mr-2 size-5" /> {label}
      </Button>
    ))}
  </div>
);

/** Simplified sidebar without router Link — for comparison/isolation testing */
const SidebarWithoutRouter = () => (
  <div className="flex w-full flex-col gap-1">
    {tabs.map(({ id, label, icon: Icon }) => (
      <button
        type="button"
        key={id}
        data-spy-link={id}
        className={cn(
          'flex items-center gap-2 rounded-md px-4 py-2 text-left text-sm transition-colors hover:bg-accent/50',
          id.includes('delete') && 'text-red-600',
          'data-spy-active:bg-secondary data-spy-active:font-medium',
        )}
        onClick={() => scrollToSectionById(id)}
      >
        <Icon className="size-5" /> {label}
      </button>
    ))}
  </div>
);

const Sidebar = ({ withRouter = true }: { withRouter?: boolean }) => {
  const sectionIds = tabs.map((t) => t.id);
  useScrollSpy(sectionIds);

  return withRouter ? <SidebarWithRouter /> : <SidebarWithoutRouter />;
};

// ─── Interactive test panel ──────────────────────────────────────────────────

/**
 * Interactive test panel — click buttons to trigger scroll actions
 * and verify the scroll spy tracks correctly without jank.
 */
const TestPanel = () => {
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const cycleRef = useRef(false);

  const addLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-49), `${new Date().toISOString().slice(11, 23)} ${msg}`]);
    requestAnimationFrame(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight));
  };

  /** Cycle through all sections rapidly to stress-test */
  const runCycleTest = () => {
    if (cycleRef.current) return;
    cycleRef.current = true;
    addLog('▶ Cycle test started');
    let i = 0;
    const next = () => {
      if (i >= tabs.length) {
        cycleRef.current = false;
        addLog(`✓ Cycle done — section=${getSection()} hash=${location.hash}`);
        return;
      }
      const { id } = tabs[i];
      addLog(`→ scrollTo(${id})`);
      scrollToSectionById(id);
      i++;
      setTimeout(next, 800);
    };
    next();
  };

  /** Verify current state matches expectations */
  const checkState = () => {
    const section = getSection();
    const hash = location.hash.slice(1);
    const domActive = document.querySelector('[data-spy-active]')?.getAttribute('data-spy-link') ?? '(none)';
    const match = section === hash && section === domActive;
    addLog(`${match ? '✓' : '✗'} section=${section} hash=#${hash} dom=${domActive}`);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="font-semibold text-sm">Test controls</div>

      {/* Scroll-to buttons */}
      <div className="flex flex-wrap gap-1">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="rounded border px-2 py-1 text-xs hover:bg-accent/50"
            onClick={() => {
              addLog(`→ scrollTo(${id})`);
              scrollToSectionById(id);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-1">
        <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-accent/50" onClick={runCycleTest}>
          Cycle all
        </button>
        <button type="button" className="rounded border px-2 py-1 text-xs hover:bg-accent/50" onClick={checkState}>
          Check state
        </button>
        <button
          type="button"
          className="ml-auto rounded border px-2 py-1 text-xs hover:bg-accent/50"
          onClick={() => setLog([])}
        >
          Clear
        </button>
      </div>

      {/* Log */}
      <div ref={logRef} className="max-h-32 space-y-0.5 overflow-y-auto rounded bg-background/50 p-2 font-mono">
        {log.length === 0 && <div className="text-muted-foreground">Click a button or scroll manually…</div>}
        {log.map((entry, i) => (
          <div
            key={i}
            className={entry.startsWith('✗') ? 'text-red-500' : entry.startsWith('✓') ? 'text-green-600' : ''}
          >
            {entry}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Full page layout ────────────────────────────────────────────────────────

const ScrollSpyPage = ({
  withRouter = true,
  label,
  showTests,
}: {
  withRouter?: boolean;
  label?: string;
  showTests?: boolean;
}) => (
  <div className="min-h-screen bg-background text-foreground">
    {/* Sticky header */}
    <div className="sticky top-0 z-10 border-b bg-background/95 p-3 backdrop-blur">
      <h1 className="font-semibold text-base">{label ?? 'Scroll Spy Test'}</h1>
      <p className="text-muted-foreground text-xs">
        {withRouter ? 'TanStack Router (production-like)' : 'No Router (isolation)'}
      </p>
    </div>

    <div className="flex">
      {/* Sidebar */}
      <div className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r p-4 md:block">
        <Sidebar withRouter={withRouter} />
        {showTests && (
          <div className="mt-4">
            <TestPanel />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative max-w-3xl flex-1 space-y-6 p-6 md:p-8">
        <SectionCard id="general" title="General Settings" lines={10} />
        <SectionCard id="details" title="Details" lines={12} />
        <SectionCard id="permissions" title="Permissions" lines={8} />
        <SectionCard id="bookmarks" title="Bookmarks" lines={10} />
        <SectionCard id="delete-section" title="Danger Zone" lines={6} />
      </div>
    </div>

    {/* Mobile sidebar (bottom) */}
    <div className="fixed right-0 bottom-0 left-0 z-10 border-t bg-background p-2 md:hidden">
      <Sidebar withRouter={withRouter} />
    </div>
  </div>
);

// ─── Router factory ──────────────────────────────────────────────────────────

const createStoryRouter = (label: string, showTests?: boolean) => {
  const rootRoute = createRootRoute({
    staticData: { isAuth: false },
    component: () => (
      <>
        <Outlet />
        <ScrollSpyPage withRouter label={label} showTests={showTests} />
      </>
    ),
  });

  const catchAllRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '$',
    staticData: { isAuth: false },
    component: () => null,
  });

  return createRouter({
    routeTree: rootRoute.addChildren([catchAllRoute]),
    scrollRestoration: true,
    scrollRestorationBehavior: 'instant',
    defaultHashScrollIntoView: { behavior: 'smooth' },
    defaultPreload: false,
    defaultPendingMinMs: 0,
  });
};

const WithRouterWrapper = ({ label, showTests }: { label: string; showTests?: boolean }) => {
  const router = useMemo(() => createStoryRouter(label, showTests), [label, showTests]);
  return <RouterProvider router={router} />;
};

// ─── Storybook meta ──────────────────────────────────────────────────────────

const meta = {
  title: 'common/ScrollSpy',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: [
          'Scroll spy test bed — each story runs in its own Storybook iframe.',
          '',
          '**What to test:**',
          '- Manual scroll → hash updates without jank',
          '- Sidebar click → smooth scroll to section',
          '- Section highlight tracks correctly',
          '- `data-spy-active` DOM attribute toggles without React re-render',
        ].join('\n'),
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─── Stories ─────────────────────────────────────────────────────────────────

/** Baseline — scroll spy with plain buttons, no router. */
export const WithoutRouter: Story = {
  render: () => <ScrollSpyPage withRouter={false} label="Without Router (baseline)" />,
};

/** Production-like — TanStack Router with scroll restoration enabled. */
export const WithRouter: Story = {
  render: () => <WithRouterWrapper label="With Router" />,
};

/** Interactive test — scroll-to buttons, cycle test, and state checker. */
export const Interactive: Story = {
  render: () => <WithRouterWrapper label="Interactive Test" showTests />,
};
