// Import package.json dynamically for version and website information
import packageJson from '../package.json' with { type: 'json' };

// Name of this CLI tool
export const NAME = 'cella sync';

// Thin line divider for console output (68 chars wide)
export const DIVIDER = '─'.repeat(60);

// package.json version
export const VERSION: string = packageJson.version;

/** Compact header line: "⚡ cella sync v0.0.1" right-aligned with website */
export function getHeaderLine(): string {
  const left = `⚡${NAME} v${VERSION}`;
  const right = packageJson.homepage.replace('https://', '');
  const padding = Math.max(1, 60 - left.length - right.length);
  return `${left}${' '.repeat(padding)}${right}`;
}
