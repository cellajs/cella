import pc from 'picocolors';
import { appConfig } from '../config-builder/app-config.ts';

const width = 60;
const divider = '─'.repeat(width);

/** A CLI's opening lines: its name and version on the left, `right` (the app's domain by default) on the right, then a divider. */
export function printHeader(name: string, version?: string, right = appConfig.domain): void {
  const visibleLeft = version ? `⧈ ${name} · v${version}` : `⧈ ${name}`;
  const padding = Math.max(1, width - visibleLeft.length - right.length);
  const left = version ? `${pc.cyan(`⧈ ${name}`)}${pc.dim(` · v${version}`)}` : pc.cyan(`⧈ ${name}`);
  console.info();
  console.info(`${left}${' '.repeat(padding)}${pc.cyan(right)}`);
  console.info(divider);
  console.info();
}
