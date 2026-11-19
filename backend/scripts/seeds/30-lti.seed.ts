import { and, asc, eq } from 'drizzle-orm';
import pc from 'picocolors';
import { appConfig, hierarchy, isStrategyEnabled } from 'shared';
import { getSeedDb } from '#/db/db';
import type { GuardedTransport } from '#/lib/guarded-fetch';
import { issueHandoffToken } from '#/modules/auth/core';
import { ltiImportScope } from '#/modules/auth/flows/lti/helpers/platform-api';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';
import { connectionsTable, isLtiConnection } from '#/modules/connections/connections-db';
import { ltiIssuerUrl, ltiPlatformConfiguration } from '#/modules/lti-platform/helpers/platform-offer';
import { approveLtiInstallation, insertLtiResourceLink } from '#/modules/lti-platform/lti-platform-queries';
import { registerLtiToolOp } from '#/modules/lti-platform/operations/register-lti-tool';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { checkMark, durationSuffix } from '#/utils/console';
import { defaultAdminUser } from '../fixtures';
import type { SeedScript } from '../types';

const db = getSeedDb();
const dbCtx = { var: { db } };

/** The platform's two addresses an LTI tool reads during Dynamic Registration, answered in-process. */
const inProcessPlatform: GuardedTransport = async ({ url, method, headers, body }) => {
  if (method === 'GET' && url.href === ltiIssuerUrl('configuration')) {
    return Response.json(ltiPlatformConfiguration({ jwksUri: `${appConfig.oauthUrl}/jwks`, tokenEndpoint: `${appConfig.oauthUrl}/token` }));
  }
  if (method === 'POST' && url.href === ltiIssuerUrl('registration')) {
    const registrationToken = headers.Authorization?.replace(/^Bearer /, '') ?? '';
    return Response.json(await registerLtiToolOp({ registrationToken, body: JSON.parse(body ?? '{}') }), { status: 201 });
  }
  return new Response(null, { status: 404 });
};

/**
 * Connects two organizations the seed admin administers, in a mode where the app is both LTI roles: the second
 * registers as an LTI tool at the first. Both halves of Dynamic Registration run through the operations their routes
 * use, the platform answering in-process. The installation is approved with the name released and the member import's
 * scope granted, and placed as a tab of the platform's organization, through the queries the approval and the placement
 * write with. A launch of that tab by the seed admin then imports the platform organization's members.
 */
export const ltiSeed = async () => {
  const startedAt = performance.now();
  if (!appConfig.has.ltiPlatform || !isStrategyEnabled('lti')) return console.info('LTI is off in this mode → skip seeding an LTI connection');

  const [seeded] = await db.select({ id: connectionsTable.id }).from(connectionsTable).where(eq(connectionsTable.kind, 'lti')).limit(1);
  if (seeded) return console.warn('An LTI connection exists → skip seeding one');

  const [platform, tool] = await db
    .select({ organization: organizationsTable })
    .from(membershipsTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, membershipsTable.channelId))
    .where(
      and(
        eq(membershipsTable.userId, defaultAdminUser.id),
        eq(membershipsTable.channelType, 'organization'),
        eq(membershipsTable.role, hierarchy.getMostPrivilegedRole('organization')),
      ),
    )
    .orderBy(asc(membershipsTable.displayOrder))
    .limit(2);
  if (!platform || !tool) return console.warn('Fewer than two organizations the admin administers → skip seeding an LTI connection');

  const createdBy = defaultAdminUser.id;
  const link = await issueHandoffToken(dbCtx, { kind: 'lti-registration', tenantId: tool.organization.tenantId, createdBy });
  const registration = await issueHandoffToken(dbCtx, { kind: 'lti-tool-registration', tenantId: platform.organization.tenantId, createdBy });

  const connection = await registerLtiPlatformOp(
    { link: link.rawToken, openid_configuration: ltiIssuerUrl('configuration'), registration_token: registration.rawToken },
    { transport: inProcessPlatform, resolve: async () => [{ address: '127.0.0.1', family: 4 }] },
  );
  if (!isLtiConnection(connection)) throw new Error('The registration stored no LTI connection');
  const [installationId] = connection.config.deploymentIds;

  const { tenantId } = platform.organization;
  await db.transaction((tx) =>
    approveLtiInstallation(
      { var: { db: tx } },
      { id: installationId, tenantId, releasedFields: ['name'], grantedScopes: [ltiImportScope], by: createdBy },
    ),
  );

  await insertLtiResourceLink(dbCtx, {
    values: {
      tenantId,
      channelType: 'organization',
      channelId: platform.organization.id,
      ...channelIdColumnsOf(platform.organization),
      installationId,
      title: tool.organization.name,
      createdBy,
    },
  });

  console.info(
    `${checkMark} LTI: ${pc.bold(platform.organization.name)} launches ${pc.bold(tool.organization.name)} from its tab, which imports its members${durationSuffix(startedAt)}`,
  );
};

export const seedConfig: SeedScript = { name: 'lti', run: ltiSeed };
