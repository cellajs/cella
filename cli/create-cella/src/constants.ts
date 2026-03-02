import pc from 'picocolors';
import packageJson from '../package.json' with { type: 'json' };

/** Name of this CLI tool */
export const NAME = 'create cella';

/** Thin line divider for console output (60 chars wide) */
export const DIVIDER = '─'.repeat(60);

/** URL of the template repository */
export const TEMPLATE_URL = 'github:cellajs/cella';

/** URL to the repository */
export const CELLA_REMOTE_URL = 'git@github.com:cellajs/cella.git';

/** Export details from package.json */
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

/** Type for file edit operations */
export type FileEdit = { regexMatch: RegExp; replaceWith: string };

// Files to be edited after downloading
export const TO_EDIT: Record<string, FileEdit[]> = {
  './shared/default-config.ts': [
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

/**
 * Generate file edits to apply a port offset to a new fork.
 * All dev ports are shifted by the given offset to avoid collisions with sibling forks.
 *
 * Only 3 files need editing — all other services derive ports from these:
 * - development-config.ts → frontend/backend URLs (read by Vite, backend, CDC, studio, tests)
 * - .env → backend PORT + database connection strings
 * - compose.yaml → Docker container names + host port mappings
 *
 * Default ports: frontend=3000, backend=4000, db=5432, dbTest=5434
 */
export function getPortEdits(projectName: string, offset: number): Record<string, FileEdit[]> {
  if (offset === 0) return {};

  const fe = 3000 + offset;
  const be = 4000 + offset;
  const db = 5432 + offset;
  const dbTest = 5434 + offset;

  return {
    './shared/development-config.ts': [
      { regexMatch: /frontendUrl:\s*'http:\/\/localhost:\d+'/g, replaceWith: `frontendUrl: 'http://localhost:${fe}'` },
      { regexMatch: /backendUrl:\s*'http:\/\/localhost:\d+'/g, replaceWith: `backendUrl: 'http://localhost:${be}'` },
      {
        regexMatch: /backendAuthUrl:\s*'http:\/\/localhost:\d+\/auth'/g,
        replaceWith: `backendAuthUrl: 'http://localhost:${be}/auth'`,
      },
    ],
    './backend/.env': [
      { regexMatch: /PORT=\d+/g, replaceWith: `PORT=${be}` },
      { regexMatch: /@0\.0\.0\.0:5432\//g, replaceWith: `@0.0.0.0:${db}/` },
    ],
    './compose.yaml': [
      { regexMatch: /name: cella/g, replaceWith: `name: ${projectName}` },
      { regexMatch: /container_name: cella_db\b/g, replaceWith: `container_name: ${projectName}_db` },
      { regexMatch: /container_name: cella_db_test/g, replaceWith: `container_name: ${projectName}_db_test` },
      { regexMatch: /- 5432:5432/g, replaceWith: `- ${db}:5432` },
      { regexMatch: /- 5434:5432/g, replaceWith: `- ${dbTest}:5432` },
    ],
  };
}
