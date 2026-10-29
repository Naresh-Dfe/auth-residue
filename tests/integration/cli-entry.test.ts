import { spawnSync } from 'node:child_process';
import { access, mkdtemp, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const binary = resolve('dist/cli/main.js');
const links: string[] = [];
let directory: string;
let linkedBinary: string;
let fileLink: string;

beforeAll(async () => {
  await access(binary);
  directory = await mkdtemp(join(tmpdir(), 'authresidue-cli-entry-'));
  const linkedDirectory = join(directory, 'linked cli');
  // Windows junctions need no symlink privilege and exercise the same argv/module mismatch.
  await symlink(dirname(binary), linkedDirectory, 'junction');
  links.push(linkedDirectory);
  linkedBinary = join(linkedDirectory, 'main.js');
  if (process.platform !== 'win32') {
    fileLink = join(directory, 'authresidue');
    await symlink(binary, fileLink, 'file');
    links.push(fileLink);
  }
});

afterAll(async () => {
  for (const link of links) await unlink(link);
  if (directory) await removeTemporary(directory);
  await access(binary);
});

async function removeTemporary(target: string): Promise<void> {
  const within = relative(resolve(tmpdir()), resolve(target));
  if (
    !within ||
    within.startsWith('..') ||
    isAbsolute(within) ||
    !basename(target).startsWith('authresidue-cli-entry-')
  )
    throw new Error('Unsafe CLI test cleanup path');
  await rm(target, { recursive: true, force: true });
}

function execute(entry: string, args: readonly string[]) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: directory,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
  });
}

describe('compiled CLI entry through filesystem links', () => {
  it.each([
    [['--version'], '0.1.0'],
    [['--help'], 'Usage: authresidue'],
    [['list'], 'logout-session'],
    [['init', '--non-interactive'], 'Created authresidue.config.ts'],
  ] as const)('executes %j through a linked directory', (args, expected) => {
    const result = execute(linkedBinary, args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(expected);
    expect(result.stderr).toBe('');
  });

  it.runIf(process.platform !== 'win32')(
    'executes through a Unix npm-style file symlink',
    () => {
      const result = execute(fileLink, ['--version']);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('0.1.0');
      expect(result.stderr).toBe('');
    },
  );

  it('can be imported from stdin without invoking the CLI', () => {
    const entryURL = pathToFileURL(binary);
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
      cwd: directory,
      input: `await import(${JSON.stringify(entryURL.href)});`,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
