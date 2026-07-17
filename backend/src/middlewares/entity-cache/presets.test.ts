import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the boundaries: the cache store and the permission engine.
const entityCacheGet = vi.fn();
const entityCacheSet = vi.fn();
vi.mock('./app-entity-cache', () => ({
  entityCache: {
    get: (...a: unknown[]) => entityCacheGet(...a),
    set: (...a: unknown[]) => entityCacheSet(...a),
  },
}));
const checkPermission = vi.fn();
vi.mock('#/permissions', () => ({ checkPermission: (...a: unknown[]) => checkPermission(...a) }));
const actorFrom = vi.fn((): Record<string, unknown> => ({}));
vi.mock('#/permissions/actor', () => ({ actorFrom: () => actorFrom() }));
const buildSubjectFromEntity = vi.fn((..._a: unknown[]) => ({}));
vi.mock('#/permissions/build-subject', () => ({
  buildSubjectFromEntity: (...a: unknown[]) => buildSubjectFromEntity(...a),
}));

const { appCache } = await import('./presets');

// The cached detail response enriches `createdBy` into a user object, the case that would
// break an `own` grant if fed to the permission subject verbatim.
const cachedAttachment = {
  id: 'att-1',
  organizationId: 'org-1',
  createdBy: { id: 'user-1', name: 'Ann', entityType: 'user' },
  publicAt: null,
  name: 'file.png',
};

const mockCtx = () => ({
  req: { param: () => 'att-1' },
  var: { memberships: [] },
  get: () => undefined,
  set: vi.fn(),
  header: vi.fn(),
  json: vi.fn((d: unknown) => d),
});

describe('appCache — per-request authorization on cache hit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entityCacheGet.mockReturnValue(cachedAttachment);
  });

  it('serves the cached row and skips the handler when the caller is allowed', async () => {
    checkPermission.mockReturnValue({ isAllowed: true });
    const ctx = mockCtx();
    const next = vi.fn();

    await appCache('attachment')(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(cachedAttachment);
    expect(ctx.header).toHaveBeenCalledWith('X-Cache', 'HIT');
  });

  it('normalizes the enriched createdBy object back to the raw id for the permission subject', async () => {
    checkPermission.mockReturnValue({ isAllowed: true });

    await appCache('attachment')(mockCtx() as never, vi.fn());

    expect(buildSubjectFromEntity).toHaveBeenCalledWith('attachment', expect.objectContaining({ createdBy: 'user-1' }));
  });

  it('falls through to the handler (never a stale serve) when the caller is NOT allowed', async () => {
    checkPermission.mockReturnValue({ isAllowed: false });
    const ctx = mockCtx();
    const next = vi.fn();

    await appCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });
});

describe('appCache — draft veto on cache hit (publishedAt lifecycle)', () => {
  // An author-cached draft: the handler ran for the author and the enriched response
  // was cached; a later hit by anyone else must not serve it, even when the engine
  // would allow the read (the engine has no draft vocabulary).
  const cachedDraft = { ...cachedAttachment, publishedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    entityCacheGet.mockReturnValue(cachedDraft);
    checkPermission.mockReturnValue({ isAllowed: true });
  });

  it('serves a cached draft to its author', async () => {
    actorFrom.mockReturnValue({ userId: 'user-1', isSystemAdmin: false });
    const ctx = mockCtx();
    const next = vi.fn();

    await appCache('attachment')(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(cachedDraft);
  });

  it('falls through for a non-author even though the engine allows the read', async () => {
    actorFrom.mockReturnValue({ userId: 'user-2', isSystemAdmin: false });
    const ctx = mockCtx();
    const next = vi.fn();

    await appCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('falls through for a system admin too — author-only means author-only', async () => {
    actorFrom.mockReturnValue({ userId: 'admin-user', isSystemAdmin: true });
    const ctx = mockCtx();
    const next = vi.fn();

    await appCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });
});
