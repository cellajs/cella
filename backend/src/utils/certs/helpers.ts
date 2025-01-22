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
    // Read the certificate file content
    const certData = readFileSync(certPath, { encoding: 'utf-8' });

    // Check if the certificate already exists in the system's root trust store
    switch (process.platform) {
      case 'darwin':
        await handleMacCert(certPath, certData);
        break;
      case 'win32':
        await handleWindowsCert(certPath, certData);
        break;
      case 'linux':
        await handleLinuxCert(certPath, certData);
        break;
      default:
        console.info('Unsupported platform:', process.platform);
        return;
    }
  } catch (error) {
    console.error('Failed to install certificate:', error);
  }
};

const handleMacCert = async (certPath: string, certData: string) => {
  const result = await runCommand(`security find-certificate -a -c "${certData}" /Library/Keychains/System.keychain`);
  if (result.exitCode === 0) return console.info('Root certificate already installed on Mac!');

  await runCommand(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
  await runCommand(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ${certPath}`);
  console.info('Root certificate installed successfully on Mac!');
};

const handleWindowsCert = async (certPath: string, certData: string) => {
  const result = await runCommand(
    `powershell -Command "Get-ChildItem -Path Cert:\\LocalMachine\\Root | Where-Object { $_.Thumbprint -eq (Get-FileHash -Algorithm SHA1 ${certData} | Select-Object -ExpandProperty Hash) }"`,
  );
  if (result.exitCode === 0) return console.info('Root certificate already installed on Windows!');

  await runCommand(
    `powershell -Command "Start-Process powershell -ArgumentList '-Command Import-Certificate -FilePath \"${certPath}\" -CertStoreLocation Cert:\\LocalMachine\\Root' -Verb RunAs"`,
  );
  console.info('Root certificate installed successfully on Windows!');
};

const handleLinuxCert = async (certPath: string, certData: string) => {
  const certHash = await runCommand(`openssl x509 -in ${certData} -noout -fingerprint -sha256`);
  const certFingerprint = certHash.exitCode === 0 ? certHash : null;

  const result = await runCommand(`grep -rl ${certFingerprint} /usr/local/share/ca-certificates/`);
  if (result.exitCode === 0) return console.info('Root certificate already installed on Linux!');

  await runCommand(`sudo cp ${certPath} /usr/local/share/ca-certificates/`);
  await runCommand('sudo update-ca-certificates');
  console.info('Root certificate installed successfully on Linux!');
};
