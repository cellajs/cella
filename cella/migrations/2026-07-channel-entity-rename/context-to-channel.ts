/**
 * Codemod: ContextEntity -> ChannelEntity rename.
 *
 * Renames the "channel entity" concept (membership-scoped entities that host products)
 * to "channel entity", unifying vocabulary with the sync engine's stream channels.
 *
 * This is both the implementation tool (run once against cella) and the fork-migration
 * tool: forks run it against their own code before `cella-cli pull` so both sides carry
 * identical renames and the pull minimizes conflicts.
 *
 * It renames ONLY an explicit allow-list of identifiers (word-boundary matched, case
 * preserving), a handful of `'context'` string literals (entity kind / OpenAPI tag), the
 * `.context()` builder/contract method, and the kebab-case stems of renamed files inside
 * import paths. It deliberately does NOT touch unrelated "context" (React context,
 * AuthContext, DbContext, TraceContext, ContextMenu, canvas getContext, tenant context, …).
 *
 * DB migration, i18n prose/values, doc prose and the file renames (see README.md) are
 * handled outside this codemod.
 *
 * Modes:
 *   inventory — report only (no writes)
 *   rewrite   — apply
 *
 * Usage (repo root):
 *   pnpm exec tsx cella/migrations/2026-07-channel-entity-rename/context-to-channel.ts inventory <srcDir ...>
 *   pnpm exec tsx cella/migrations/2026-07-channel-entity-rename/context-to-channel.ts rewrite  <srcDir ...>
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Whole-identifier allow-list: every "context"/"Context"/"CONTEXT" in these maps to channel. */
export const IDENTIFIERS: readonly string[] = [
  'ActivityContextColumns',
  'AncestorContextType',
  'ContextCounterModel',
  'ContextEntity',
  'ContextEntityBase',
  'ContextEntityIdColumns',
  'ContextEntityIdOverrides',
  'ContextEntityListQueryFactory',
  'ContextEntityListQueryMap',
  'ContextEntityType',
  'ContextEntityView',
  'ContextEntry',
  'ContextPolicyBuilder',
  'ContextQueryProp',
  'ContextRelationColumns',
  'ContextScope',
  'Contexts',
  'CountMembershipsByContextOpts',
  'CountPendingInvitesByContextOpts',
  'DEEP_CONTEXT_ROLES',
  'DeepContextType',
  'EMPTY_CONTEXT_IDS',
  'EnrichedContextEntity',
  'EntityMembershipContextProp',
  'FindMemberPreviewsByContextsOpts',
  'FindMembershipsByUserIdsAndContextOpts',
  'HierarchyContextType',
  'InsertContextCounterModel',
  'ItemDataWithContext',
  'MEMBERSHIP_CONTEXT_ID_COLUMNS',
  'MemberContextProp',
  'MockContextIdColumns',
  'MockEntityContextIdColumns',
  'RelatableContextEntityType',
  'RelatedContextShape',
  'RelatedContextType',
  'ResolvedContextIds',
  'RootContextType',
  'TContexts',
  'TestEntityContextColumn',
  'TestEntityContextRow',
  'ValidContextEntityResult',
  'WideContextBuilder',
  'WideContextType',
  '_contextTypesMatch1',
  '_contextTypesMatch2',
  'activeContextIds',
  'activityContextColumns',
  'allSubContextIdSet',
  'allSubContextIds',
  'ancestorContextIds',
  'archivedContextIds',
  'batchContextKey',
  'childContext',
  'childContextChangeSummarySchema',
  'childContextChanges',
  'clientContextSeq',
  'collectContextIds',
  'collectSubContextIds',
  'contextCache',
  'contextCases',
  'contextChanged',
  'contextColumnList',
  'contextCountersTable',
  'contextCounts',
  'contextData',
  'contextDelta',
  'contextDescendants',
  'contextEntities',
  'contextEntity',
  'contextEntityBaseSchema',
  'contextEntityBaseSelect',
  'contextEntityColumns',
  'contextEntityConfigs',
  'contextEntityData',
  'contextEntityId',
  'contextEntityIds',
  'contextEntityIncludedSchema',
  'contextEntityListQueriesByType',
  'contextEntityResults',
  'contextEntityTableNames',
  'contextEntityTables',
  'contextEntityType',
  'contextEntityTypeSchema',
  'contextEntityTypes',
  'contextId',
  'contextIdColumn',
  'contextIdColumnKeys',
  'contextIdColumns',
  'contextIds',
  'contextIdsByType',
  'contextIsDraft',
  'contextKey',
  'contextQueries',
  'contextRelationColumns',
  'contextRoles',
  'contextRows',
  'contextSnapshot',
  'contextType',
  'contextTypes',
  'context_counters',
  'context_counters_pkey',
  'context_entities',
  'context_id',
  'context_key',
  'context_type',
  'countDeltasByContextKey',
  'countMembershipsByContext',
  'countPendingInvitesByContext',
  'createContextBuilders',
  'createContextPolicyBuilder',
  'deeperContexts',
  'deeperContextsOf',
  'deepestContext',
  'defaultContextIds',
  'deletedContextIds',
  'deletedContextSet',
  'entityContextIdMap',
  'entityTypesWithChildContextData',
  'findContextCountersByKeys',
  'findMemberPreviewsByContexts',
  'findMembershipsByUserIdsAndContext',
  'findPendingInactiveMembershipsByContexts',
  'fullAncestorContextIds',
  'generateMockContextIdColumns',
  'generateMockEntityBodyContextIdColumns',
  'generateMockEntityContextIdColumns',
  'getContextConfig',
  'getContextEntityKeys',
  'getContextEntityRoute',
  'getContextRoles',
  'getContextSeq',
  'getMembershipContextId',
  'getMembershipContextKey',
  'getRegisteredContextEntities',
  'getRelatedContexts',
  'getSeenContextId',
  'getSubjectContextId',
  'getValidContextEntity',
  'groupingContextTypes',
  'handledContextKeys',
  'hasParentContextChanged',
  'homeContext',
  'initContextEntityEnrichment',
  'invalidateAllContextDetails',
  'invalidateContextList',
  'isContext',
  'isContextEntity',
  'lastContext',
  'lastContextSnapshot',
  'makeContextId',
  'membershipContextColumns',
  'memberships_context_org_role_idx',
  'memberships_unique_context',
  'missingContext',
  'mockContextEntityBase',
  'mockContextMembership',
  'orderedContexts',
  'parentContextType',
  'possibleHomeContexts',
  'primaryContext',
  'primaryContextId',
  'queryContext',
  'queryWithoutContext',
  'relatableContextTypes',
  'relatableContexts',
  'relatedContext',
  'relatedContextShape',
  'relatedContexts',
  'requestedSubContext',
  'resolveContextKey',
  'resolveOrderedContexts',
  'resolvedContextId',
  'rootContext',
  'rootContextId',
  'rootContextType',
  'rootContextTypes',
  'rowContextColumns',
  'seedContextRows',
  'seededContextRowIdsByTable',
  'seenGroupingContextTypes',
  'seen_by_user_context_type_index',
  'seqContextKeys',
  'serverContextSeq',
  'setContextId',
  'setContextSeq',
  'sqlContextColumns',
  'subContext',
  'subContextColumn',
  'subContextId',
  'subContextIds',
  'subContextIdsByOrg',
  'subContextType',
  'subjectContextId',
  'upsertContextCounters',
  'validateRelatedContexts',
  'withoutContext',
];

/** Kebab-case file stems that are renamed on disk; rewritten inside import paths too. */
export const FILE_STEMS: Readonly<Record<string, string>> = {
  'mock-context-entity-id-columns': 'mock-channel-entity-id-columns',
  'collect-sub-context-ids': 'collect-sub-channel-ids',
  'context-entity-included': 'channel-entity-included',
  'context-relation-columns': 'channel-relation-columns',
  'context-relation-schema': 'channel-relation-schema',
  'context-entity-columns': 'channel-entity-columns',
  'resolve-row-context': 'resolve-row-channel',
  'context-entity-route': 'channel-entity-route',
  'context-counters-db': 'channel-counters-db',
  'collect-context-ids': 'collect-channel-ids',
  'get-context-entity': 'get-channel-entity',
  'context-columns': 'channel-columns',
};

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', '.git', 'sdk/gen', '.claude', 'drizzle', '.todos', 'build', 'coverage']);

/** Preserve the case of each matched "context" occurrence when swapping to "channel". */
function toChannel(token: string): string {
  return token.replace(/context/gi, (m) => {
    if (m === 'CONTEXT') return 'CHANNEL';
    if (m === 'Context') return 'Channel';
    return 'channel';
  });
}

const idAlternation = [...IDENTIFIERS].sort((a, b) => b.length - a.length).join('|');
const ID_RE = new RegExp(`\\b(${idAlternation})\\b`, 'g');
const stemAlternation = Object.keys(FILE_STEMS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const STEM_RE = new RegExp(`(${stemAlternation})`, 'g');

export function transform(source: string): string {
  let out = source;
  out = out.replace(STEM_RE, (m) => FILE_STEMS[m] ?? m);
  out = out.replace(/\.context\(/g, '.channel(');
  out = out.replace(/\bcontext</g, 'channel<'); // entity-hierarchy + evolution-contract method defs
  out = out.replace(/'context'/g, "'channel'"); // EntityKind literal + OpenAPI tag
  out = out.replace(ID_RE, (m) => toChannel(m));
  return out;
}

function shouldSkipDir(path: string): boolean {
  const parts = path.split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (path.includes('sdk/gen')) return true;
  return false;
}

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (shouldSkipDir(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (CODE_EXT.has(full.slice(full.lastIndexOf('.')))) files.push(full);
  }
}

function main(): void {
  const mode = process.argv[2];
  const roots = process.argv.slice(3);
  if ((mode !== 'inventory' && mode !== 'rewrite') || roots.length === 0) {
    throw new Error('usage: context-to-channel.ts <inventory|rewrite> <srcDir ...>');
  }
  const dry = mode === 'inventory';

  const files: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const st = statSync(root);
    if (st.isDirectory()) walk(root, files);
    else if (CODE_EXT.has(root.slice(root.lastIndexOf('.')))) files.push(root);
  }

  let changed = 0;
  for (const file of files) {
    if (file.endsWith('context-to-channel.ts')) continue; // never rewrite this codemod
    const src = readFileSync(file, 'utf8');
    const next = transform(src);
    if (next !== src) {
      changed++;
      if (!dry) writeFileSync(file, next);
      console.info(`${dry ? '[dry] ' : ''}rewrote ${file}`);
    }
  }
  console.info(`\n${changed} file(s) ${dry ? 'would change' : 'changed'} of ${files.length} scanned.`);
}

// Only run when invoked directly (not when imported for its exported helpers/tests).
if (process.argv[1]?.endsWith('context-to-channel.ts')) {
  main();
}
