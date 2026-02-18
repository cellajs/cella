import type { ContextEntityType, EntityActionType, EntityIdColumnKeys, ProductEntityType, SystemRole } from 'shared';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

export type ContextEntityIdColumns = {
  [K in ContextEntityType as EntityIdColumnKeys[K]]?: string | null;
};

export type SubjectForPermission = {
  entityType: ContextEntityType | ProductEntityType;
  id?: string;
} & ContextEntityIdColumns;

export interface ActionAttribution {
  enabled: boolean;
  grantedBy: Array<{
    contextType: ContextEntityType;
    contextId: string;
    role: string;
  }>;
}

export interface PermissionDecision<T extends MembershipBaseModel = MembershipBaseModel> {
  subject: {
    entityType: ContextEntityType | ProductEntityType;
    id?: string;
    contextIds: Partial<Record<ContextEntityType, string>>;
  };
  orderedContexts: ContextEntityType[];
  primaryContext: ContextEntityType;
  actions: Record<EntityActionType, ActionAttribution>;
  can: Record<EntityActionType, boolean>;
  membership: T | null;
}

export interface PermissionCheckOptions {
  systemRole?: SystemRole | null;
}
