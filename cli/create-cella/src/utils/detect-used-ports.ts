import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface UsedPorts {
  project: string;
  frontend: number;
  backend: number;
  offset: number;
}

/**
 * Scan sibling directories for existing cella forks and extract their dev ports.
 * Looks for `shared/development-config.ts` to identify cella-based projects.
 */
export async function detectUsedPorts(targetFolder: string): Promise<UsedPorts[]> {
  const parentDir = dirname(targetFolder);
  const used: UsedPorts[] = [];

  let siblings: string[];
  try {
    siblings = await readdir(parentDir);
  } catch {
    return used;
  }

  for (const name of siblings) {
    const configPath = join(parentDir, name, 'shared/development-config.ts');
    try {
      const content = await readFile(configPath, 'utf8');
      const feMatch = content.match(/frontendUrl:\s*'http:\/\/localhost:(\d+)'/);
      const beMatch = content.match(/backendUrl:\s*'http:\/\/localhost:(\d+)'/);
      if (feMatch && beMatch) {
        const frontend = Number(feMatch[1]);
        const backend = Number(beMatch[1]);
        used.push({
          project: name,
          frontend,
          backend,
          offset: frontend - 3000,
        });
      }
    } catch {
      // Not a cella fork, skip
    }
  }

  return used;
}

/** Find the next available offset (in steps of 10) that doesn't collide with existing forks. */
export function findNextOffset(usedPorts: UsedPorts[]): number {
  const usedOffsets = new Set(usedPorts.map((p) => p.offset));
  for (let offset = 0; offset <= 490; offset += 10) {
    if (!usedOffsets.has(offset)) return offset;
  }
  return 0;
}
