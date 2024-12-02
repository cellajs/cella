import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

export interface Fork {
  name: string;
  remoteUrl: string;
  branch: string;
}

export interface Config {
  divergedFile: string | null;
  ignoreFile: string | null;
  ignoreList: string[];
  upstreamBranch?: string;
  forks: Fork[];
  problems?: string[];
}

// Function to extract paths from .json (simple key-value pairs)
async function extractFromJson(configFile: string): Promise<Config> {
  try {
    const fileContent = await readFile(configFile, 'utf-8');
    const config: Config = JSON.parse(fileContent);

    return extractConfig(config);
  } catch (error) {
    return { divergedFile: null, ignoreFile: null, ignoreList: [], forks: [], problems: [`Error parsing JSON file: ${error}`] };
  }
}

// Function to extract paths using dynamic import for ES modules
async function extractUsingDynamicImport(configFile: string): Promise<Config> {
  try {
    const { config } = await import(resolve(configFile)) as { config: Config };

    return extractConfig(config);
  } catch (error) {
    return { divergedFile: null, ignoreFile: null, ignoreList: [], forks: [], problems: [`Error dynamically importing JS/TS file: ${error}`] };
  }
}

function extractConfig(config: Config): Config {
  try {
    const divergedFile = config.divergedFile || null;
    const ignoreFile = config.ignoreFile || null;
    const ignoreList = Array.isArray(config.ignoreList) ? config.ignoreList : [];
    const upstreamBranch = config.upstreamBranch;
    const forks = (Array.isArray(config.forks) ? config.forks : []).filter(
      (fork): fork is Fork => !!fork.name && !!fork.remoteUrl && !!fork.branch
    );  

    return { divergedFile, ignoreFile, ignoreList, upstreamBranch, forks };

  } catch(error) {
    return { divergedFile: null, ignoreFile: null, ignoreList: [], forks: [], problems: [`Error reading config settings: ${error}`] };
  }
  
}

// Main function to decide which extraction method to use
export async function extractValues(configFile: string): Promise<Config> {
  const fileExt = extname(configFile).toLowerCase();

  if (fileExt === '.json') {
    return extractFromJson(configFile);
  } else if (fileExt === '.js' || fileExt === '.ts') {
    return extractUsingDynamicImport(configFile);
  } else {
    return { divergedFile: null, ignoreFile: null, ignoreList: [], forks: [], problems: [`Unsupported file format: ${fileExt}. Only .json, .ts, and .js are supported.`] };
  }
}
