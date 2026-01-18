import AdmZip from 'adm-zip';
import { logEvent } from '#/utils/logger';

/**
 * Extract files from a zip archive buffer
 * Returns an array of file paths and their content
 */
export function extractZip(buffer: Buffer): Array<{ path: string; content: Buffer }> {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const files: Array<{ path: string; content: Buffer }> = [];

  // Find common root directory (many archives have a single root folder)
  let commonRoot = '';
  const firstEntry = entries.find((e) => !e.isDirectory);
  if (firstEntry) {
    const parts = firstEntry.entryName.split('/');
    if (parts.length > 1 && entries.every((e) => e.entryName.startsWith(`${parts[0]}/`))) {
      commonRoot = `${parts[0]}/`;
    }
  }

  for (const entry of entries) {
    // Skip directories
    if (entry.isDirectory) continue;

    // Remove common root prefix if present
    let path = entry.entryName;
    if (commonRoot && path.startsWith(commonRoot)) {
      path = path.slice(commonRoot.length);
    }

    // Skip hidden files and common non-deployment files
    if (shouldSkipFile(path)) continue;

    const content = entry.getData();
    files.push({ path, content });
  }

  logEvent('debug', 'Extracted zip archive', { fileCount: files.length, commonRoot });
  return files;
}

/**
 * Extract files from a tar.gz archive buffer
 * Uses streaming decompression with tar-stream
 */
export async function extractTarGz(buffer: Buffer): Promise<Array<{ path: string; content: Buffer }>> {
  // Dynamic import for tar-stream since it's a stream-based module
  const zlib = await import('node:zlib');
  const tar = await import('tar-stream');
  const { Readable } = await import('node:stream');

  return new Promise((resolve, reject) => {
    const files: Array<{ path: string; content: Buffer }> = [];
    const extract = tar.extract();

    // Find common root by collecting first few entries
    let commonRoot = '';
    const allPaths: string[] = [];

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];

      if (header.type === 'file') {
        allPaths.push(header.name);

        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const content = Buffer.concat(chunks);
          files.push({ path: header.name, content });
          next();
        });
      } else {
        stream.resume();
        next();
      }
    });

    extract.on('finish', () => {
      // Detect and remove common root
      if (files.length > 0) {
        const firstParts = files[0].path.split('/');
        if (firstParts.length > 1 && files.every((f) => f.path.startsWith(`${firstParts[0]}/`))) {
          commonRoot = `${firstParts[0]}/`;
        }
      }

      // Apply common root removal and filtering
      const processedFiles = files
        .map((f) => ({
          path: commonRoot ? f.path.slice(commonRoot.length) : f.path,
          content: f.content,
        }))
        .filter((f) => !shouldSkipFile(f.path));

      logEvent('debug', 'Extracted tar.gz archive', { fileCount: processedFiles.length, commonRoot });
      resolve(processedFiles);
    });

    extract.on('error', reject);

    // Decompress and pipe to tar extractor
    const gunzip = zlib.createGunzip();
    gunzip.on('error', reject);

    Readable.from(buffer).pipe(gunzip).pipe(extract);
  });
}

/**
 * Detect archive type and extract accordingly
 */
export async function extractArchive(buffer: Buffer): Promise<Array<{ path: string; content: Buffer }>> {
  // Check magic bytes for file type detection
  const header = buffer.slice(0, 4);

  // ZIP files start with PK (0x50, 0x4B)
  if (header[0] === 0x50 && header[1] === 0x4b) {
    return extractZip(buffer);
  }

  // Gzip files start with 0x1F, 0x8B
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return extractTarGz(buffer);
  }

  throw new Error('Unsupported archive format. Expected zip or tar.gz');
}

/**
 * Check if a file should be skipped during extraction
 */
function shouldSkipFile(path: string): boolean {
  // Skip hidden files
  if (path.startsWith('.') || path.includes('/.')) return true;

  // Skip common non-deployment files
  const skipPatterns = [
    '__MACOSX',
    '.DS_Store',
    'Thumbs.db',
    '.git/',
    '.github/',
    'node_modules/',
    '.env',
    '.npmrc',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.eslintrc',
    '.prettierrc',
    'tsconfig.json',
    '.gitignore',
  ];

  return skipPatterns.some((pattern) => path.includes(pattern));
}
