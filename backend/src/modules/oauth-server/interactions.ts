import type { HttpBindings } from '@hono/node-server';
import { and, eq } from 'drizzle-orm';
import { type Context, Hono } from 'hono';
import type Provider from 'oidc-provider';
import { appConfig, scopes } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { appErrorHandler } from '#/lib/error';
import { loadActiveTenant } from '#/middlewares/guard/tenant-cache';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { AppClientMetadata } from '#/modules/oauth-server/adapter';
import { parseResource, type ResourceRef } from '#/modules/oauth-server/resources';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';

type InteractionEnv = { Bindings: HttpBindings; Variables: Env['Variables'] };

interface ConsentDetails {
  client: { id: string; name: string; logoUri: string | null; kind: 'cimd' | 'registered' };
  scopes: string[];
  resource: ResourceRef;
  user: { id: string; name: string };
  /** What the provider is asking for (`login`, `consent`) and why; the page shows the reasons when it refuses. */
  prompt: { name: string; reasons: string[] };
  /** Why the consent screen must refuse; null when the user may accept. */
  refusal: 'not_a_member' | 'clients_not_allowed' | 'app_not_installed' | null;
}

/** The interaction cookie the provider set is scoped to `/oauth/interaction/<uid>`, so every route here sees it. */
export function createInteractionsApp(provider: Provider): Hono<InteractionEnv> {
  const app = new Hono<InteractionEnv>();
  app.onError(appErrorHandler as never);

  /** The provider lands the user-agent here; the React consent page takes over and calls the JSON routes below. */
  app.get('/oauth/interaction/:uid', (c) =>
    c.redirect(`${appConfig.frontendUrl}/oauth/consent?uid=${c.req.param('uid')}`),
  );

  app.get('/oauth/interaction/:uid/details', async (c) => {
    const { user, details } = await loadInteraction(provider, c);
    return c.json(details, user ? 200 : 401);
  });

  app.post('/oauth/interaction/:uid/consent', async (c) => {
    const { user, details, interaction, clientId } = await loadInteraction(provider, c);
    if (!user) throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'no_session' } });
    const { accept } = (await c.req.json()) as { accept?: boolean };

    if (!accept || details.refusal) {
      const redirectTo = await provider.interactionResult(
        c.env.incoming,
        c.env.outgoing,
        { error: 'access_denied', error_description: details.refusal ?? 'The user refused' },
        { mergeWithLastSubmission: false },
      );
      return c.json({ redirectTo });
    }

    const existing = interaction.grantId ? await provider.Grant.find(interaction.grantId) : undefined;
    const grant = existing ?? new provider.Grant({ accountId: user.id, clientId });
    // Entity scopes are both the provider's scopes and the resource's: the grant records them in both forms.
    const resource = String(interaction.params.resource);
    grant.addOIDCScope(details.scopes.join(' '));
    grant.addResourceScope(resource, details.scopes.join(' '));
    const grantId = await grant.save();

    const redirectTo = await provider.interactionResult(
      c.env.incoming,
      c.env.outgoing,
      { login: { accountId: user.id, remember: false }, consent: { grantId } },
      { mergeWithLastSubmission: true },
    );
    return c.json({ redirectTo });
  });

  return app;
}

async function loadInteraction(provider: Provider, c: Context<InteractionEnv>) {
  const interaction = await provider.interactionDetails(c.env.incoming, c.env.outgoing);
  const clientId = String(interaction.params.client_id);
  const client = (await provider.Client.find(clientId)) as (AppClientMetadata & { clientId: string }) | undefined;
  if (!client) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'unknown_client' } });

  const resource = parseResource(String(interaction.params.resource ?? ''));
  if (!resource) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'invalid_target' } });

  const requested = String(interaction.params.scope ?? '')
    .split(' ')
    .filter((scope): scope is (typeof scopes.all)[number] => (scopes.all as readonly string[]).includes(scope));

  const user = await sessionUser(c);
  const kind = client.client_kind === 'registered' ? 'registered' : 'cimd';
  const refusal = user ? await refusalFor(user.id, kind, clientId, resource) : null;

  const details: ConsentDetails = {
    client: {
      id: clientId,
      name: String(client.client_name ?? clientId),
      logoUri: (client.logo_uri as string) ?? null,
      kind,
    },
    scopes: requested,
    resource,
    user: user ? { id: user.id, name: user.name } : { id: '', name: '' },
    prompt: { name: interaction.prompt.name, reasons: interaction.prompt.reasons },
    refusal,
  };
  return { user, details, interaction, clientId };
}

async function sessionUser(c: Context<InteractionEnv>) {
  try {
    const { sessionToken } = await getParsedSessionCookie(c as never);
    const { user } = await validateSession(sessionToken);
    return user;
  } catch {
    return null;
  }
}

/** Consent needs a foothold in the resource's tenant and, per client kind, the tenant's policy (D4) or an installation. */
async function refusalFor(
  userId: string,
  kind: 'cimd' | 'registered',
  clientId: string,
  resource: ResourceRef,
): Promise<ConsentDetails['refusal']> {
  const [membership] = await baseDb
    .select({ id: membershipsTable.id })
    .from(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.tenantId, resource.tenantId)))
    .limit(1);
  if (!membership) return 'not_a_member';

  if (kind === 'cimd') {
    const tenant = await loadActiveTenant(resource.tenantId);
    return tenant.restrictions.allowConsentedClients ? null : 'clients_not_allowed';
  }

  const [installation] = await baseDb
    .select({ id: serviceAccountsTable.id })
    .from(serviceAccountsTable)
    .where(
      and(
        eq(serviceAccountsTable.clientId, clientId),
        eq(serviceAccountsTable.tenantId, resource.tenantId),
        eq(serviceAccountsTable.status, 'active'),
      ),
    )
    .limit(1);
  return installation ? null : 'app_not_installed';
}
