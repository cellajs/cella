import type { HttpBindings } from '@hono/node-server';
import { type Context, Hono } from 'hono';
import type Provider from 'oidc-provider';
import { accessScopes, appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { appErrorHandler } from '#/lib/error';
import { resolveSession } from '#/modules/auth/general/helpers/session';
import { requireStepUp } from '#/modules/auth/step-up/helpers/step-up';
import { grantRefusal, type UserGrantRefusal } from '#/modules/oauth-server/grant-policy';
import { deleteProviderSession, findConsentTargetNames } from '#/modules/oauth-server/oauth-server-queries';
import { parseResource, type ResourceRef } from '#/modules/oauth-server/resources';

type InteractionEnv = { Bindings: HttpBindings; Variables: Env['Variables'] };

interface ConsentDetails {
  client: { id: string; name: string; logoUri: string | null; kind: 'cimd' | 'registered' };
  scopes: string[];
  resource: ResourceRef;
  /** The names of the tenant and, on the MCP face, the organization the grant reaches; null where the user is not a member. */
  target: { tenant: string | null; organization: string | null };
  /** Null when no session is present (the page sends the person to sign in). */
  user: { id: string; name: string } | null;
  /** What the provider is asking for (`login`, `consent`) and why; the page shows the reasons when it refuses. */
  prompt: { name: string; reasons: string[] };
  /** Why the consent screen must refuse (the grant policy's answer); null when the user may accept. */
  refusal: Exclude<UserGrantRefusal, 'unknown_user'> | null;
}

/** The interaction cookie the provider set is scoped to `/oauth/interaction/<uid>`, so every route here sees it. */
export function createInteractionsApp(provider: Provider): Hono<InteractionEnv> {
  const app = new Hono<InteractionEnv>();
  // The interactions app binds Node's request objects; the handler reads only what every Hono context has.
  app.onError(appErrorHandler as never);

  /** The provider lands the user-agent here; the React consent page takes over and calls the JSON routes below. */
  app.get('/oauth/interaction/:uid', (c) =>
    c.redirect(`${appConfig.frontendUrl}/auth/consent?uid=${c.req.param('uid')}`),
  );

  app.get('/oauth/interaction/:uid/details', async (c) => {
    const { signedIn, details } = await loadInteraction(provider, c);
    return c.json(details, signedIn ? 200 : 401);
  });

  app.post('/oauth/interaction/:uid/consent', async (c) => {
    const { signedIn, details, interaction, clientId } = await loadInteraction(provider, c);
    if (!signedIn) throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'no_session' } });
    const { user, session } = signedIn;
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

    // Granting a client access to the account needs the user present on this session again, never an impersonation.
    await requireStepUp(session);

    // The authorization server's session in this browser may name someone who consented here before: it ends, and
    // the resume signs this user in to a fresh one.
    const previous = interaction.session;
    if (previous && previous.accountId !== user.id) {
      await deleteProviderSession({ var: { db: baseDb } }, { id: previous.cookie });
      interaction.session = undefined;
      await interaction.save(interaction.exp - Math.floor(Date.now() / 1000));
    }

    // The browser's earlier grant for this client carries on only when it is this user's own.
    const existing = interaction.grantId ? await provider.Grant.find(interaction.grantId) : undefined;
    const grant =
      existing?.accountId === user.id && existing.clientId === clientId
        ? existing
        : new provider.Grant({ accountId: user.id, clientId });
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
  const client = await provider.Client.find(clientId);
  if (!client) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'unknown_client' } });

  const resource = parseResource(String(interaction.params.resource ?? ''));
  if (!resource) throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: 'invalid_target' } });

  const requested = accessScopes.parse(String(interaction.params.scope ?? ''));

  const signedIn = await resolveSession(c).catch(() => null);
  const user = signedIn?.user ?? null;
  const refusal = user
    ? await grantRefusal({ kind: 'user', userId: user.id, clientId, tenantId: resource.tenantId })
    : null;
  // The session's user is gone since the session was read: consent starts over from sign-in.
  if (refusal === 'unknown_user') throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'no_session' } });

  // Where the grant reaches is named by the server, as the client is, and never to someone outside it.
  const target =
    user && refusal !== 'not_a_member'
      ? await findConsentTargetNames({ var: { db: baseDb } }, { userId: user.id, resource })
      : { tenant: null, organization: null };

  const details: ConsentDetails = {
    // A metadata document is written by the client's author, who would learn every consenting viewer's address from a
    // logo and could claim any name: such a client shows the host serving its client id. A registered app shows the
    // name and logo a system admin set.
    client:
      'clientIdMetadataDocument' in client
        ? { id: clientId, name: new URL(clientId).host, logoUri: null, kind: 'cimd' }
        : { id: clientId, name: client.clientName ?? clientId, logoUri: client.logoUri ?? null, kind: 'registered' },
    scopes: requested,
    resource,
    target,
    user: user ? { id: user.id, name: user.name } : null,
    prompt: { name: interaction.prompt.name, reasons: interaction.prompt.reasons },
    refusal,
  };
  return { signedIn, details, interaction, clientId };
}
