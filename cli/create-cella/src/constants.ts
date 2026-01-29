// Name of this CLI tool
export const NAME = 'create cella';

// Thin line divider for console output (60 chars wide)
export const DIVIDER = '─'.repeat(60);

// URL of the template repository
export const TEMPLATE_URL = 'github:cellajs/cella';

// URL to the repository
export const CELLA_REMOTE_URL = 'git@github.com:cellajs/cella.git';

// Import package.json dynamically for version and website information
import packageJson from '../package.json' with { type: 'json' };
import pc from 'picocolors';

// Export details from package.json
export const DESCRIPTION: string = packageJson.description;
export const VERSION: string = packageJson.version;
export const AUTHOR: string = packageJson.author;
export const WEBSITE: string = packageJson.homepage;
export const GITHUB: string = packageJson.repository.url;

export function getHeaderLine(templateVersion?: string): string {
  const leftText = `⧈ ${NAME} · v${VERSION} · cella v${templateVersion}`;
  const rightText = packageJson.homepage.replace('https://', '');
  const left = `${pc.cyan(`⧈ ${NAME}`)} ${pc.dim(`· v${VERSION} · cella v${templateVersion}`)}`;
  const right = pc.cyan(rightText);
  const padding = Math.max(1, 60 - leftText.length - rightText.length);
  return `${left}${' '.repeat(padding)}${right}`;
}

// Files or folders to be removed from the template after downloading
export const TO_REMOVE: string[] = ['./cli/create', './info/QUICKSTART.md'];

// Specific folder contents to be cleaned out from the template
export const TO_CLEAN: string[] = ['./backend/drizzle'];

// Files to copy/paste after downloading
export const TO_COPY: Record<string, string> = {
  './backend/.env.example': './backend/.env',
  './frontend/.env.example': './frontend/.env',
  './info/QUICKSTART.md': 'README.md',
};

// Files to be edited after downloading
export const TO_EDIT: Record<string, { regexMatch: RegExp; replaceWith: string }[]> = {
  './config/default.ts': [
    {
      regexMatch: /enabledAuthStrategies:\s*\[[^\]]+\]\s*as\s*const,/g,
      replaceWith: "enabledAuthStrategies: ['password', 'passkey', 'totp'] as const,",
    },
    {
      regexMatch: /uploadEnabled:\s*(true|false),/g,
      replaceWith: 'uploadEnabled: false,',
    },
    {
      regexMatch: /enabledOAuthProviders:\s*\[[^\]]+\]\s*as\s*const,/g,
      replaceWith: 'enabledOAuthProviders: [] as const,',
    },
  ],
};
