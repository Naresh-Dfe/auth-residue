import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectReleaseText, isPackagePathAllowed } from './check-release.mjs';

const npmCLI = process.env.npm_execpath;
if (!npmCLI) throw new Error('Run through npm run verify:package.');
const root = fileURLToPath(new URL('..', import.meta.url));
function npm(args, cwd = root) {
  const execution = spawnSync(process.execPath, [npmCLI, ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (execution.status !== 0)
    throw new Error(
      `Package verification failed while running npm ${args[0]}. Check npm cache access, dependency availability, and build setup. Raw output is withheld.`,
    );
  return execution.stdout;
}
npm(['run', 'build']);
const dryRun = JSON.parse(
  npm(['pack', '--ignore-scripts', '--dry-run', '--json']),
)[0];
const names = dryRun.files.map((file) => file.path);
if (
  !['dist/cli/main.js', 'dist/index.d.ts', 'LICENSE'].every((name) =>
    names.includes(name),
  )
)
  throw new Error('Missing distributable entry points or license.');
for (const name of names) {
  if (!isPackagePathAllowed(name))
    throw new Error(`Unexpected npm package file: ${name}`);
  const contents = await readFile(resolve(root, name), 'utf8');
  const findings = inspectReleaseText(contents, name, true);
  if (findings.length)
    throw new Error(
      `Package data check failed: ${name} (${findings.join(', ')}). Values withheld.`,
    );
}
async function removeTemporary(directory) {
  const withinTemp = relative(resolve(tmpdir()), resolve(directory));
  if (
    !withinTemp ||
    withinTemp.startsWith('..') ||
    isAbsolute(withinTemp) ||
    !basename(directory).startsWith('authresidue-package-')
  )
    throw new Error(
      'Refusing cleanup outside the temporary package directory.',
    );
  await rm(directory, { recursive: true, force: true });
}
const temporary = await mkdtemp(join(tmpdir(), 'authresidue-package-'));
try {
  const packed = JSON.parse(
    npm([
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      temporary,
    ]),
  )[0];
  const installation = join(temporary, 'installation');
  await mkdir(installation);
  await writeFile(
    join(installation, 'package.json'),
    '{"private":true,"type":"module"}\n',
  );
  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      join(temporary, packed.filename),
    ],
    installation,
  );
  const binary = join(
    installation,
    'node_modules/authresidue/dist/cli/main.js',
  );
  const executableVersion = npm(
    ['exec', '--offline', '--', 'authresidue', '--version'],
    installation,
  ).trim();
  if (executableVersion !== '0.1.0')
    throw new Error(
      `Installed executable shim failed: ${executableVersion ? 'unexpected version output' : 'no version output'}. Check CLI entry detection through filesystem links.`,
    );
  for (const args of [
    ['--version'],
    ['--help'],
    ['list'],
    ['init', '--non-interactive'],
  ]) {
    const result = spawnSync(process.execPath, [binary, ...args], {
      cwd: installation,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.status !== 0)
      throw new Error(`Installed CLI command failed: ${args.join(' ')}`);
  }
  const library = await import(
    pathToFileURL(join(installation, 'node_modules/authresidue/dist/index.js'))
      .href
  );
  if (
    typeof library.run !== 'function' ||
    typeof library.defineConfig !== 'function'
  )
    throw new Error('Missing library exports.');
  const source = await readFile(
    join(installation, 'authresidue.config.ts'),
    'utf8',
  );
  if (!source.includes("from 'authresidue'"))
    throw new Error('Invalid init template.');
  await library.loadConfig(join(installation, 'authresidue.config.ts'));
  console.log(
    `Verified ${packed.filename}: ${names.length} allowlisted files; no development fixtures, reports, local paths, or recognized secret formats. Installed CLI/library checks passed. Nothing was published.`,
  );
} finally {
  await removeTemporary(temporary);
}
