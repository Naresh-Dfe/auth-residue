import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = process.argv[2];
if (!['dev', 'build', 'start'].includes(command))
  throw new Error('Use dev, build, or start.');
const args = [
  fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)),
  command,
];
if (command !== 'build') args.push('--hostname', '127.0.0.1', '--port', '3000');
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  windowsHide: true,
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Cannot start the demo. Install dependencies first.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
