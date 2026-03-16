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
  './frontend/.env.example': './frontend/.env',
  './info/QUICKSTART.md': 'README.md',
};

/**
 * Placeholder config template that replaces `shared/default-config.ts` in new forks.
 * Contains `__project_name__` and `__project_slug__` tokens interpolated at create time.
 */
export const PLACEHOLDER_CONFIG = './cli/create-cella/configs/default-config.ts.template';

/**
 * Read a `.env.example` file and apply key=value replacements.
 * Comments and unmatched keys are preserved as-is.
 * Returns null if the file doesn't exist (caller should generate from scratch).
 */
export async function generateEnvFromExample(
  examplePath: string,
  replacements: Record<string, string>,
): Promise<string | null> {
  const { readFile } = await import('node:fs/promises');
  let content: string;
  try {
    content = await readFile(examplePath, 'utf8');
  } catch {
    return null;
  }

  return content.replace(/^([A-Z_][A-Z0-9_]*)=(.*)$/gm, (match, key, _value) => {
    if (key in replacements) return `${key}=${replacements[key]}`;
    return match;
  });
}

/** Replacement map for root `.env` */
export function getRootEnvReplacements(slug: string, portOffset: number): Record<string, string> {
  return {
    PROJECT_SLUG: slug,
    DB_PORT: String(5432 + portOffset),
    DB_TEST_PORT: String(5434 + portOffset),
  };
}

/** Replacement map for `backend/.env` */
export function getBackendEnvReplacements(adminEmail: string, portOffset: number): Record<string, string> {
  const db = 5432 + portOffset;
  return {
    DATABASE_URL: `postgres://runtime_role:dev_password@0.0.0.0:${db}/postgres`,
    DATABASE_ADMIN_URL: `postgres://postgres:postgres@0.0.0.0:${db}/postgres`,
    DATABASE_CDC_URL: `postgres://cdc_role:dev_password@0.0.0.0:${db}/postgres`,
    ADMIN_EMAIL: adminEmail,
    PORT: String(4000 + portOffset),
  };
}

/**
 * Generate env config files with project-specific values.
 * All configs go through the same data-driven loop.
 * Values prefixed with '=' are emitted as raw TS expressions (not quoted).
 */
export function generateEnvConfigs(slug: string, name: string, portOffset: number): Record<string, string> {
  const fe = 3000 + portOffset;
  const be = 4000 + portOffset;

  const header =
    "import type { DeepPartial } from './src/builder/types';\nimport type _default from './default-config';\n";

  // Per-environment specs: optional imports + object props (= prefix → raw TS expression)
  const envs: Record<string, { imports?: string; props: Record<string, string | boolean> }> = {
    development: {
      props: {
        slug: `${slug}-development`,
        debug: false,
        domain: '',
        frontendUrl: `http://localhost:${fe}`,
        backendUrl: `http://localhost:${be}`,
        backendAuthUrl: `http://localhost:${be}/auth`,
      },
    },
    staging: {
      props: {
        slug: `${slug}-staging`,
        debug: false,
        domain: `${slug}.example.com`,
        frontendUrl: `https://staging.${slug}.example.com`,
        backendUrl: `https://api-staging.${slug}.example.com`,
        backendAuthUrl: `https://api-staging.${slug}.example.com/auth`,
      },
    },
    tunnel: {
      props: {
        frontendUrl: `https://localhost:${fe}`,
        backendUrl: `https://${slug}.ngrok.dev`,
        backendAuthUrl: `https://${slug}.ngrok.dev/auth`,
      },
    },
    test: {
      imports: "import development from './development-config';\n",
      props: {
        debug: false,
        domain: '',
        frontendUrl: '=development.frontendUrl',
        backendUrl: '=development.backendUrl',
        backendAuthUrl: '=development.backendAuthUrl',
      },
    },
    production: { props: { maintenance: false } },
  };

  // Serialize value: '=' prefix → raw TS expression, boolean → literal, string → quoted
  const lit = (v: string | boolean) => {
    if (typeof v === 'boolean') return String(v);
    if (v.startsWith('=')) return v.slice(1);
    return `'${v}'`;
  };

  const result: Record<string, string> = {};

  for (const [mode, { imports = '', props }] of Object.entries(envs)) {
    const nameEntry = mode !== 'production' ? `  name: '${name} ${mode.toUpperCase()}',\n` : '';
    const body = Object.entries(props)
      .map(([k, v]) => `  ${k}: ${lit(v)},`)
      .join('\n');
    result[`./shared/${mode}-config.ts`] =
      `${imports}${header}\nexport default {\n  mode: '${mode}',\n${nameEntry}${body}\n} satisfies DeepPartial<typeof _default>;\n`;
  }

  return result;
}
