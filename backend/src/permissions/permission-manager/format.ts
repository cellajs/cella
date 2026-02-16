import { appConfig, type EntityActionType } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { createActionRecord } from './action-helpers';
import type { PermissionDecision } from './types';

/**
 * Formats a PermissionDecision for debug logging.
 * Output shows the full decision tree: subject, contexts, and per-action attribution.
 */
export const formatPermissionDecision = <T extends MembershipBaseModel>(decision: PermissionDecision<T>): string => {
  const lines = [
    `[Permission Check] entity=${decision.subject.entityType} id=${decision.subject.id}`,
    `├─ Context IDs: ${JSON.stringify(decision.subject.contextIds)}`,
    `├─ Ordered Contexts: [${decision.orderedContexts.join(', ')}]`,
    `├─ Primary Context: ${decision.primaryContext}`,
    '│',
    '├─ Action Attribution:',
  ];

  for (const action of appConfig.entityActions) {
    const attr = decision.actions[action];
    const status = attr.enabled ? '✓ GRANTED' : '✗ DENIED';
    const grants =
      attr.grantedBy.length > 0
        ? `by [${attr.grantedBy.map((g) => `${g.contextType}:${g.contextId}/${g.role}`).join(', ')}]`
        : '(no grants)';
    lines.push(`│  ├─ ${action}: ${status} ${grants}`);
  }

  lines.push('│');
  lines.push(`├─ can: ${JSON.stringify(decision.can)}`);
  lines.push(`└─ membership: ${decision.membership ? `role=${decision.membership.role}` : 'null'}`);

  return lines.join('\n');
};

/**
 * Formats a batch permission check summary for debug logging.
 * Output shows aggregated counts per entity type and action.
 */
export const formatBatchPermissionSummary = <T extends MembershipBaseModel>(
  decisions: Map<string, PermissionDecision<T>>,
): string => {
  if (decisions.size === 0) return '[Batch Permission] No subjects checked';

  // Group by entity type
  const byType = new Map<
    string,
    { granted: Record<EntityActionType, number>; denied: Record<EntityActionType, number> }
  >();

  for (const decision of decisions.values()) {
    const type = decision.subject.entityType;
    if (!byType.has(type)) {
      byType.set(type, {
        granted: createActionRecord(() => 0),
        denied: createActionRecord(() => 0),
      });
    }
    const stats = byType.get(type);
    if (!stats) continue;

    for (const action of appConfig.entityActions) {
      if (decision.can[action]) {
        stats.granted[action]++;
      } else {
        stats.denied[action]++;
      }
    }
  }

  const lines = [`[Batch Permission] ${decisions.size} subjects checked`];
  for (const [type, stats] of byType) {
    const actionSummary = appConfig.entityActions
      .map((action) => `${action}=${stats.granted[action]}✓/${stats.denied[action]}✗`)
      .join(' ');
    lines.push(`  ${type}: ${actionSummary}`);
  }

  return lines.join('\n');
};
