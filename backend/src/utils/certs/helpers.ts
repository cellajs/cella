import { type ExecOptions, exec } from 'node:child_process';

export const runCommand = (command: string, options: ExecOptions = {}) => {
  return new Promise<{ exitCode: number }>((resolve) => {
    exec(command, options, (error) => {
      return resolve({ exitCode: error?.code ?? 0 });
    });
  });
};

export const installRootCert = async (certPath: string) => {
  try {
    let logSuccess = false;
    switch (process.platform) {
      case 'darwin':
        await installMacCert(certPath);
        logSuccess = true;
        break;
      case 'win32':
        await installWindowsCert(certPath);
        logSuccess = true;

        break;
      case 'linux':
        await installLinuxCert(certPath);
        logSuccess = true;
        break;
      default:
        console.info('Unsupported platform:', process.platform);
        logSuccess = false;
        return;
    }

    if (logSuccess) console.info('Root certificate installed successfully!');
  } catch (error) {
    console.error('Failed to install certificate:', error);
  }
};

const installMacCert = async (certPath: string) => {
  // Install to system keychain
  await runCommand(`sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${certPath}`);
  // Install to the user's login keychain (for the current user)
  await runCommand(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain ${certPath}`);
};

const installWindowsCert = async (certPath: string) => {
  // Run PowerShell with elevated privileges for installing the certificate
  await runCommand(
    `powershell -Command "Start-Process powershell -ArgumentList '-Command Import-Certificate -FilePath \"${certPath}\" -CertStoreLocation Cert:\\LocalMachine\\Root' -Verb RunAs"`,
  );
};

const installLinuxCert = async (certPath: string) => {
  // Copy the certificate to the system CA certificates directory
  await runCommand(`sudo cp ${certPath} /usr/local/share/ca-certificates/`);
  // Update CA certificates
  await runCommand('sudo update-ca-certificates');
};
