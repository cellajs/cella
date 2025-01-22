import { type ExecOptions, exec } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const runCommand = (command: string, options: ExecOptions = {}) => {
  return new Promise<{ exitCode: number }>((resolve) => {
    exec(command, options, (error) => {
      return resolve({ exitCode: error?.code ?? 0 });
    });
  });
};

export const installRootCert = async (certPath: string) => {
  try {
    // Check if the certificate already exists in the system's root trust store
    switch (process.platform) {
      case 'darwin':
        await handleMacCert(certPath);
        break;
      case 'win32':
        await handleWindowsCert(certPath);
        break;
      case 'linux':
        await handleLinuxCert(certPath);
        break;
      default:
        console.info('Unsupported platform:', process.platform);
        return;
    }
  } catch (error) {
    console.error('Failed to install certificate:', error);
  }
};

const handleMacCert = async (certPath: string) => {
  const certData = readFileSync(certPath, { encoding: 'utf-8' });
  const result = await runCommand(`security find-certificate -a -c "${certData}" /Library/Keychains/System.keychain`);
  if (result.exitCode === 0) return console.info('Root certificate already installed on Mac!');

  await runCommand(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
  await runCommand(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ${certPath}`);
  console.info('Root certificate installed successfully on Mac!');
};

const handleWindowsCert = async (certPath: string) => {
  const result = await runCommand(
    `powershell -Command "Get-ChildItem -Path Cert:\\LocalMachine\\Root | Where-Object { $_.Thumbprint -eq ((Get-FileHash -Path '${certPath}' -Algorithm SHA1).Hash) }"`,
  );
  if (result.exitCode === 0) return console.info('Root certificate already installed on Windows!');

  await runCommand(
    `powershell -Command "Start-Process powershell -ArgumentList '-Command Import-Certificate -FilePath \"${certPath}\" -CertStoreLocation Cert:\\LocalMachine\\Root' -Verb RunAs"`,
  );
  console.info('Root certificate installed successfully on Windows!');
};

const handleLinuxCert = async (certPath: string) => {
  const rootPath = '/usr/local/share/ca-certificates/';

  await runCommand(`sudo mkdir -p ${certPath} ${rootPath}`);
  await runCommand(`sudo cp -n ${certPath} ${rootPath}/cella.crt`);
  await runCommand('sudo update-ca-certificates');
  console.info('Root certificate installed successfully on Linux!');
};
