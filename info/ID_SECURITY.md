# Entity ID and Timestamp Security

This document describes security considerations for client-provided entity IDs and timestamps in Cella's sync architecture.

## Problem Statement

For offline-first and optimistic update patterns, clients generate entity IDs (via `nanoid`) before syncing to the server. This enables:
- Immediate local persistence without server roundtrip
- Conflict-free entity creation across offline periods
- Predictable optimistic updates

However, accepting client-generated IDs and timestamps introduces security risks:
1. **ID Collision Attacks**: Malicious clients could submit IDs that collide with existing entities
2. **ID Injection**: Clients could craft predictable IDs to exploit patterns
3. **Timestamp Manipulation**: Clients could set `createdAt` to manipulate ordering/audit trails

## Current Approach: ID Generation

### Client-Side ID Generation
IDs are generated using `nanoid` with cryptographically secure randomness:
```typescript
import { nanoid } from '#/utils/nanoid';
const entityId = nanoid(); // 21 characters, URL-safe alphabet
```

### Schema Validation
Entity create schemas explicitly pick only allowed fields:
```typescript
// attachment-schema.ts
export const attachmentCreateBodySchema = attachmentInsertSchema.pick({
  id: true,           // Allowed: client generates for optimistic updates
  name: true,
  filename: true,
  // ... other allowed fields
});
```

## Recommended Security Measures

### 1. ID Format Validation
Add strict format validation to prevent malformed IDs:
```typescript
import { z } from '@hono/zod-openapi';

// Nanoid default: 21 chars, [A-Za-z0-9_-]
export const clientIdSchema = z
  .string()
  .length(21)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid ID format')
  .describe('Client-generated entity ID (nanoid format)');

// Usage in create schema
export const attachmentCreateBodySchema = z.object({
  id: clientIdSchema,
  name: validNameSchema,
  // ...
});
```

### 2. Server-Side ID Override Option
For maximum security, override client IDs server-side:
```typescript
// In handler
const serverGeneratedId = nanoid();
const attachmentsToInsert = newAttachments.map((att) => ({
  ...att,
  id: serverGeneratedId, // Override client ID
}));
```

**Trade-off**: This breaks optimistic update patterns since client can't predict the final ID.

### 3. ID Collision Check
Validate IDs don't already exist before insertion:
```typescript
// In handler
const existingIds = await db
  .select({ id: attachmentsTable.id })
  .from(attachmentsTable)
  .where(inArray(attachmentsTable.id, newAttachments.map(a => a.id)));

if (existingIds.length > 0) {
  throw new AppError(409, 'id_conflict', 'warn', {
    entityType: 'attachment',
    meta: { conflictingIds: existingIds.map(e => e.id) },
  });
}
```

### 4. CreatedAt Server Override
**Always set `createdAt` server-side** - never accept from client:
```typescript
// Current implementation (correct)
const attachmentsToInsert = newAttachments.map((att) => ({
  ...att,
  entityType: 'attachment' as const,
  createdAt: getIsoDate(),  // Server timestamp, not client
  createdBy: user.id,       // From authenticated context
}));
```

The create body schema should NOT include `createdAt`:
```typescript
export const attachmentCreateBodySchema = attachmentInsertSchema.pick({
  id: true,
  name: true,
  // createdAt: false - NOT included, always server-set
});
```

### 5. Rate Limiting Entity Creation
Prevent mass ID collision attempts:
```typescript
// Already implemented via organization restrictions
if (attachmentRestrictions !== 0 && currentAttachments + newAttachments.length > attachmentRestrictions) {
  throw new AppError(403, 'restrict_by_org', 'warn', { entityType: 'attachment' });
}
```

## Implementation Checklist

- [ ] Add `clientIdSchema` to shared schemas
- [ ] Apply format validation to all create schemas accepting IDs
- [ ] Verify `createdAt` is never in create body schemas
- [ ] Add collision check in handlers for high-security entities
- [ ] Document client ID generation requirements in API docs

## Security vs Offline Trade-offs

| Approach | Security | Offline Support | Optimistic Updates |
|----------|----------|-----------------|-------------------|
| Client IDs + validation | Medium | ✅ Full | ✅ Works |
| Server ID override | High | ⚠️ Requires sync | ❌ Breaks |
| Client IDs + collision check | High | ✅ Full | ✅ Works |

**Recommendation**: Use client IDs with format validation and collision checks for product entities that need offline support. Use server-generated IDs for context entities (organizations, memberships) where offline creation is not required.
