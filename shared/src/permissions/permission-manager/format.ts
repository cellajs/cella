import { appConfig } from '../../config-builder/app-config';
import type { EntityActionType } from '../../../types';
import { createActionRecord } from '../action-helpers';
import type { GrantSource, PermissionDecision, PermissionMembership } from './types';

const formatGrant = (g: GrantSource): string => {
  if (g.type === 'membership') return `${g.channelType}:${g.channelId}/${g.role}`;
  if (g.type === 'public') return 'public';
  if (g.type === 'systemAdmin') return 'systemAdmin';
  return `relation:${g.relation}`;
};

/** Formats a decision tree for debug logging. */
export const formatPermissionDecision = <T extends PermissionMembership>(decision: PermissionDecision<T>): string => {
  const lines = [
    `[Permission Check] entity=${decision.subject.entityType} id=${decision.subject.id}`,
    `├─ Context IDs: ${JSON.stringify(decision.subject.channelIds)}`,
    '│',
    '├─ Action Attribution:',
  ];

  for (const action of appConfig.entityActions) {
    const attr = decision.actions[action];
    const status = attr.enabled ? '✓ GRANTED' : '✗ DENIED';
    const grants = attr.grantedBy.length > 0 ? `by [${attr.grantedBy.map(formatGrant).join(', ')}]` : '(no grants)';
    lines.push(`│  ├─ ${action}: ${status} ${grants}`);
  }

  lines.push('│');
  lines.push(`├─ can: ${JSON.stringify(decision.can)}`);
  lines.push(`└─ membership: ${decision.membership ? `role=${decision.membership.role}` : 'null'}`);

  return lines.join('\n');
};

/** Formats per-entity and per-action decision counts for debug logging. */
export const formatBatchPermissionSummary = <T extends PermissionMembership>(
  decisions: Map<string, PermissionDecision<T>>,
): string => {
  if (decisions.size === 0) return '[Batch Permission] No subjects checked';

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
