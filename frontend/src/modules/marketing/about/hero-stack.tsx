import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { chromeBorder, chromeFill } from '~/modules/marketing/device-mockup-frame';
import { useUIStore } from '~/modules/ui/ui-store';
import { cn } from '~/utils/cn';

const autoOpenDelayMs = 5000;

type CodeFile = { name: string; lines: string[] };

const numbered = (files: CodeFile[]) => files.map(({ name, lines }) => ({ name, lines: lines.map((text, index) => ({ number: index + 1, text })) }));

// Abridged to fit the screen: backend/src/modules/organization/organization-routes.ts and
// frontend/src/modules/organization/query.ts. Closed shows the organization page's endpoint, open the menu's.
const closedCode = numbered([
  {
    name: 'organization-routes.ts',
    lines: [
      'getOrganization: xRoute({',
      "  method: 'get',",
      '  path:',
      "    '/{tenantId}/organizations/{id}',",
      '  xGuard: [actorGuard, tenantGuard],',
      "  xScope: 'organization:read',",
      '  request: {',
      '    params: tenantIdParamSchema,',
      '    query: slugIncludeQuerySchema,',
      '  },',
      '  responses: {',
      "    200: json('Organization',",
      '      organizationSchema),',
      '    ...errors(404),',
      '  },',
      '}),',
    ],
  },
  {
    name: 'query.ts',
    lines: [
      "import { getOrganization } from 'sdk';",
      '',
      'const organizationQueryOptions = (',
      '  id: string,',
      '  tenantId: string,',
      ') =>',
      '  queryOptions({',
      '    queryKey: keys.detail.byId(id),',
      '    queryFn: () =>',
      '      getOrganization({',
      '        path: { tenantId, id },',
      "        query: { include: 'counts' },",
      '      }),',
      '  });',
    ],
  },
]);

const openCode = numbered([
  {
    name: 'organization-routes.ts',
    lines: [
      'getOrganizations: xRoute({',
      "  method: 'get',",
      "  path: '/organizations',",
      '  xGuard: [userGuard, relatableGuard],',
      '  request: {',
      '    query: organizationListQuerySchema,',
      '  },',
      '  responses: {',
      "    200: json('Organizations',",
      '      paginationSchema(',
      '        organizationSchema)),',
      '  },',
      '}),',
    ],
  },
  {
    name: 'query.ts',
    lines: [
      "import { getOrganizations } from 'sdk';",
      '',
      'const fetchOrganizationsPage = async (',
      '  query: OrganizationFilters,',
      '  limit: number,',
      '  offset: number,',
      ') =>',
      '  getOrganizations({',
      '    query: {',
      '      ...query,',
      '      ...pageQuery(limit, offset),',
      '    },',
      '  });',
    ],
  },
]);

const tokenPattern =
  /(?<keyword>\b(?:import|from|const|async)\b)|(?<string>'[^']*')|(?<number>\b\d+\b)|(?<call>\w+(?=\())|(?<property>\w+(?=:))|(?<punctuation>[^\w\s']+)/g;

const tokenClasses = {
  keyword: 'text-violet-300',
  string: 'text-lime-300',
  number: 'text-orange-300',
  call: 'text-sky-300',
  property: 'text-amber-200',
  punctuation: 'text-zinc-500',
};

function CodeLine({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of text.matchAll(tokenPattern)) {
    parts.push(text.slice(end, match.index));
    const className = Object.entries(tokenClasses).find(([kind]) => match.groups?.[kind])?.[1];
    parts.push(
      <span key={match.index} className={className}>
        {match[0]}
      </span>,
    );
    end = match.index + match[0].length;
  }
  parts.push(text.slice(end));
  return parts;
}

function CodeScreen({ files, className }: { files: ReturnType<typeof numbered>; className?: string }) {
  return (
    <div className={cn('absolute inset-0 bg-zinc-900 pt-[26px] font-mono text-[10px] leading-[15px] text-zinc-200', className)}>
      <div className="flex gap-[4px] overflow-hidden px-[14px] pb-[10px] text-[9.5px] whitespace-nowrap">
        {files.map(({ name }, index) => (
          <span key={name} className={cn('shrink-0 rounded-[7px] px-[9px] py-[4px]', index === 0 ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}>
            {name}
          </span>
        ))}
      </div>
      {files.map(({ name, lines }, index) => (
        <div key={name}>
          {index > 0 && <div className="mt-[12px] border-t border-zinc-800 px-[14px] py-[8px] text-[9.5px] text-zinc-400">{name}</div>}
          {lines.map(({ number, text }) => (
            <div key={number} className="ps-[6px] pe-[8px] whitespace-pre">
              <span className="me-[8px] inline-block w-[20px] text-end text-zinc-600">{number}</span>
              <CodeLine text={text} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface HeroStackProps {
  /** True once the stack is in view: from then the menu opens by itself after a while, unless the visitor toggled it. */
  shown: boolean;
  className?: string;
}

/** A phone showing the app's code with the screen it renders floating above it, scaled by an ancestor's `--hero-stack-scale`. */
export function HeroStack({ shown, className }: HeroStackProps) {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const [open, setOpen] = useState(false);
  const [toggled, setToggled] = useState(false);

  useEffect(() => {
    if (!shown || toggled) return;
    const timer = setTimeout(() => setOpen(true), autoOpenDelayMs);
    return () => clearTimeout(timer);
  }, [shown, toggled]);

  const toggle = () => {
    setToggled(true);
    setOpen((current) => !current);
  };

  const shot = (name: string) => `/static/marketing/screenshots/${name}${mode === 'dark' ? '-dark' : ''}.webp`;
  const motion = 'duration-500 ease-in-out motion-reduce:transition-none';

  return (
    <button
      type="button"
      aria-pressed={open}
      aria-label={t('about:hero.menu_toggle')}
      onClick={toggle}
      className={cn(
        'focus-effect absolute h-[752px] w-[684px] scale-(--hero-stack-scale) cursor-pointer rounded-3xl select-none perspective-[2400px] perspective-origin-[314px_462px]',
        className,
      )}
    >
      <div aria-hidden="true" className="absolute top-[132px] left-[156px] h-[660px] w-[316px] rotate-x-46 -rotate-z-32 transform-3d">
        <div className={cn('absolute inset-0 rounded-[46px] border-10', chromeBorder, chromeFill)}>
          <div className={cn('absolute -inset-s-[14px] top-[150px] h-[56px] w-[4px] rounded-s-[4px]', chromeFill)} />
          <div className={cn('absolute -inset-e-[14px] top-[200px] h-[84px] w-[4px] rounded-e-[4px]', chromeFill)} />
          <div className="relative size-full overflow-hidden rounded-[36px] text-start">
            <CodeScreen files={closedCode} className={cn('transition-opacity', motion, open && 'opacity-0')} />
            <CodeScreen files={openCode} className={cn('transition-opacity', motion, !open && 'opacity-0')} />
          </div>
        </div>
        {/* At 2x, scaled to half, so the tilted layer rasterizes sharp */}
        <div className="absolute top-[10px] left-[10px] h-[1280px] w-[592px] origin-top-left translate-z-[300px] scale-50 overflow-hidden rounded-[72px] ring-16 ring-black/8 dark:ring-white/12">
          <img src={shot('hero-page')} alt="" width={592} height={1280} decoding="async" className="size-full max-w-none" />
          <div className={cn('bg-overlay absolute inset-0 transition-opacity', motion, !open && 'opacity-0')} />
          {/* The sheet fills the shot's left 95%; the rest is the page it dims */}
          <img
            src={shot('hero-menu')}
            alt=""
            width={592}
            draggable={false}
            height={1280}
            decoding="async"
            className={cn(
              'absolute inset-0 size-full max-w-none transition-transform [clip-path:inset(0_5%_0_0)]',
              motion,
              !open && '-translate-x-[95%]',
            )}
          />
        </div>
      </div>
    </button>
  );
}
