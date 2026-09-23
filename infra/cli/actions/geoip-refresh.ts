import { deriveInfra } from '../../lib/naming';
import { checkMark, crossMark, pc } from '../../lib/utils/cli-output';
import { errorMessage } from '../../lib/utils/errors';
import { DEFAULT_PREFIX, main as geoipRefresh, monthOf } from '../../tasks/geoip-refresh';
import { confirmOrDefault, type InfraContext } from '../shared';

/**
 * "Refresh GeoIP data": publish this month's DB-IP Lite databases to the `geoip/` prefix of the public bucket. Running
 * API processes pick them up within a day; the deploy pipeline and the monthly workflow run the same task, so this
 * action is the out-of-band lever. Uses the standing admin key from `infra/.env.<mode>` (object storage full access).
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

  if (!process.env.SCW_ACCESS_KEY || !process.env.SCW_SECRET_KEY) {
    console.error(
      `${crossMark} SCW_ACCESS_KEY / SCW_SECRET_KEY are not set: add the admin key to infra/.env.${context.environment}.`,
    );
    process.exit(1);
  }

  const force = await confirmOrDefault({
    message: 'Publish even when this month is already in the bucket?',
    default: false,
  });

  try {
    await geoipRefresh(['--bucket', bucket, '--region', region, ...(force ? ['--force'] : [])]);
    console.info(
      `\n${checkMark} ${pc.green('Done.')} ${pc.dim('Each API process re-checks the prefix daily and on boot.')}\n`,
    );
  } catch (error) {
    console.error(`\n${crossMark} GeoIP refresh failed: ${errorMessage(error)}\n`);
    process.exit(1);
  }
}
