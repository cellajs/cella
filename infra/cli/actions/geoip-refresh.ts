import { deriveInfra } from '../../lib/naming';
import { resolveOperatorIdentity } from '../../lib/scaleway/operator-identity';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { DEFAULT_PREFIX, main as geoipRefresh, monthOf } from '../../tasks/geoip-refresh';
import { confirmOrDefault, type InfraContext } from '../shared';

/**
 * "Refresh GeoIP data": publish this month's DB-IP Lite databases to the `geoip/` prefix of the public bucket. Running
 * API processes pick them up within a day; the deploy pipeline and the monthly workflow run the same task, so this
 * action is the out-of-band lever. Uses the admin application key from `infra/.env.<mode>` (object storage full access).
 */
export async function runGeoipRefresh(context: InfraContext): Promise<void> {
  const { naming, region } = deriveInfra(context.appConfig);
  const bucket = naming.publicBucket;

  console.info(
    pc.dim('\nRefresh GeoIP data: download the DB-IP Lite databases and publish them to the public bucket.'),
  );
  console.info(
    `  bucket   ${pc.bold(bucket)} ${pc.dim(`(${region})`)}   prefix ${pc.bold(`${DEFAULT_PREFIX}/`)}   month ${pc.bold(monthOf(new Date()))}\n`,
  );

  const admin = resolveOperatorIdentity().admin;
  if (!admin) {
    console.error(
      `${crossMark} No admin application key in infra/.env.${context.environment} (SCW_ADMIN_ACCESS_KEY / SCW_ADMIN_SECRET_KEY): Manage keys & secrets → Fetch admin application key.`,
    );
    process.exit(1);
  }

  const force = await confirmOrDefault({
    message: 'Publish even when this month is already in the bucket?',
    default: false,
  });

  try {
    await geoipRefresh(['--bucket', bucket, '--region', region, ...(force ? ['--force'] : [])], { key: admin });
    console.info(
      `\n${checkMark} ${pc.green('Done.')} ${pc.dim('Each API process re-checks the prefix daily and on boot.')}\n`,
    );
  } catch (error) {
    console.error(`\n${crossMark} GeoIP refresh failed: ${errorMessage(error)}\n`);
    process.exit(1);
  }
}
