import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '#/core/context';

// Mock the boundaries: the cache store and the permission engine.
const productCacheGet = vi.fn();
const productCacheSet = vi.fn();
vi.mock('./app-product-cache', () => ({
  productCache: { get: (...a: unknown[]) => productCacheGet(...a), set: (...a: unknown[]) => productCacheSet(...a) },
}));
const checkAccess = vi.fn();
vi.mock('#/permissions', () => ({ checkAccess: (...a: unknown[]) => checkAccess(...a) }));
const accessFrom = vi.fn((): Record<string, unknown> => ({}));
vi.mock('#/permissions/access', () => ({ accessFrom: () => accessFrom() }));
const buildSubjectFromEntity = vi.fn((..._a: unknown[]) => ({}));
vi.mock('#/permissions/build-subject', () => ({ buildSubjectFromEntity: (...a: unknown[]) => buildSubjectFromEntity(...a) }));

const { productCache } = await import('./presets');
const { productCache: store } = await vi.importActual<typeof import('./app-product-cache')>('./app-product-cache');

// The cached detail response enriches `createdBy` into a user object, the case that would
// break an `own` grant if fed to the permission subject verbatim.
const cachedAttachment = {
  id: 'att-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  createdBy: { id: 'user-1', name: 'Ann', entityType: 'user' },
  public: false,
  name: 'file.png',
};

const mockCtx = ({ tenantId = 'tenant-1', organizationId = 'org-1' } = {}) => ({
  req: { param: () => 'att-1' },
  var: { memberships: [], tenantId, organizationId },
  get: () => undefined,
  set: vi.fn(),
  header: vi.fn(),
  json: vi.fn((d: unknown) => d),
});

describe('productCache: per-request authorization on cache hit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productCacheGet.mockReturnValue(cachedAttachment);
  });

  it('serves the cached row and skips the handler when the caller is allowed', async () => {
    checkAccess.mockReturnValue({ allowed: true });
    const ctx = mockCtx();
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(cachedAttachment);
    expect(ctx.header).toHaveBeenCalledWith('X-Cache', 'HIT');
  });

  it('normalizes the enriched createdBy object back to the raw id for the permission subject', async () => {
    checkAccess.mockReturnValue({ allowed: true });

    await productCache('attachment')(mockCtx() as never, vi.fn());

    expect(buildSubjectFromEntity).toHaveBeenCalledWith('attachment', expect.objectContaining({ createdBy: 'user-1' }));
  });

  it.each([
    { scope: 'another tenant', path: { tenantId: 'tenant-2' } },
    { scope: 'another organization', path: { organizationId: 'org-2' } },
  ])('must not serve a cached row on the path of $scope, even when the engine allows the read', async ({ path }) => {
    checkAccess.mockReturnValue({ allowed: true });
    const ctx = mockCtx(path);
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('falls through to the handler (never a stale serve) when the caller is NOT allowed', async () => {
    checkAccess.mockReturnValue({ allowed: false });
    const ctx = mockCtx();
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });
});

describe('productCache: draft veto on cache hit (publishedAt lifecycle)', () => {
  // An author-cached draft must not serve to anyone else, even when the engine allows the read: it has no draft rules
  const cachedDraft = { ...cachedAttachment, publishedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    productCacheGet.mockReturnValue(cachedDraft);
    checkAccess.mockReturnValue({ allowed: true });
  });

  it('serves a cached draft to its author', async () => {
    accessFrom.mockReturnValue({ actorId: 'user-1', isSystemAdmin: false, memberships: [] });
    const ctx = mockCtx();
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.json).toHaveBeenCalledWith(cachedDraft);
  });

  it('falls through for a non-author even though the engine allows the read', async () => {
    accessFrom.mockReturnValue({ actorId: 'user-2', isSystemAdmin: false, memberships: [] });
    const ctx = mockCtx();
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });

  it('falls through for a system admin too: author-only means author-only', async () => {
    accessFrom.mockReturnValue({ actorId: 'admin-user', isSystemAdmin: true, memberships: [] });
    const ctx = mockCtx();
    const next = vi.fn();

    await productCache('attachment')(ctx as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(ctx.json).not.toHaveBeenCalled();
  });
});

/** A detail route behind the cache and the store itself, in the request scope of `cachedAttachment`. */
describe('productCache: reads that miss', () => {
  const detailRoute = (respond: () => Promise<Record<string, unknown> | null>) => {
    const handler = vi.fn(async () => {});
    const app = new Hono<Env>()
      .use(async (ctx, next) => {
        ctx.set('tenantId', 'tenant-1');
        ctx.set('organizationId', 'org-1');
        await next();
      })
      .get('/attachments/:id', productCache('attachment'), async (ctx) => {
        handler();
        const row = await respond();
        ctx.set('productCacheData', row);
        return ctx.json(row ?? {}, 200);
      });
    return { app, handler };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    productCacheGet.mockImplementation(store.get);
    productCacheSet.mockImplementation(store.set);
    accessFrom.mockReturnValue({ actorId: 'user-1', isSystemAdmin: false, memberships: [] });
    checkAccess.mockReturnValue({ allowed: true });
  });

  it('answers each concurrent miss with its own handler when the first one stores nothing', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { app, handler } = detailRoute(async () => {
      await held;
      return null;
    });

    const answers = Promise.all([1, 2, 3].map(() => app.request('/attachments/att-1')));
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    release();

    expect((await answers).map((answer) => answer.status)).toEqual([200, 200, 200]);
    expect(handler).toHaveBeenCalledTimes(3);
  });

  it('must not serve a row its drop removed via an id spelled in another letter case', async () => {
    const { app, handler } = detailRoute(async () => ({ ...cachedAttachment, createdBy: null }));

    expect((await app.request('/attachments/ATT-1')).headers.get('X-Cache')).toBe('MISS');
    store.invalidateProduct('attachment', 'att-1');

    expect((await app.request('/attachments/ATT-1')).headers.get('X-Cache')).toBe('MISS');
    expect(handler).toHaveBeenCalledTimes(2);
    // The row is stored under its own id, the one a drop names (positive control).
    expect((await app.request('/attachments/att-1')).headers.get('X-Cache')).toBe('HIT');
  });
});
