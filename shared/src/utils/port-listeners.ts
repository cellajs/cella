import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * The ids of the processes listening on a TCP port of this machine.
 * @returns An empty list when nothing listens.
 */
export const portListeners = (port: number): number[] => {
  const command =
    os.platform() === 'win32'
      ? `powershell -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`
      : `lsof -tiTCP:${port} -sTCP:LISTEN || true`;
  return [...new Set(execSync(command, { encoding: 'utf8' }).split(/\s+/).filter(Boolean).map(Number))];
};
