import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { check } from 'prettier';
import { expect, it } from 'vitest';

it('keeps a fresh Git checkout formatter-clean when core.autocrlf is enabled', async () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'authresidue-eol-'));
  const git = (...args) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        'core.autocrlf=true',
        '-c',
        'core.attributesFile=',
        '-C',
        directory,
        ...args,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    if (result.status !== 0)
      throw new Error('Line-ending fixture Git operation failed');
  };
  try {
    const policyFile = resolve('.gitattributes');
    const policy = fs.existsSync(policyFile)
      ? fs.readFileSync(policyFile, 'utf8')
      : '';
    fs.writeFileSync(join(directory, '.gitattributes'), policy);
    const source = 'export const value = 1;\n';
    const sample = join(directory, 'sample.ts');
    fs.writeFileSync(sample, source);
    git('init', '--quiet');
    git('add', '--', '.gitattributes', 'sample.ts');
    fs.unlinkSync(sample);
    git('checkout-index', '--force', '--', 'sample.ts');
    const checkedOut = fs.readFileSync(sample, 'utf8');
    expect(checkedOut).toBe(source);
    const config = JSON.parse(
      fs.readFileSync(resolve('.prettierrc.json'), 'utf8'),
    );
    expect(await check(checkedOut, { ...config, filepath: 'sample.ts' })).toBe(
      true,
    );
  } finally {
    removeTemporary(directory);
  }
});

function removeTemporary(directory) {
  const within = relative(resolve(tmpdir()), resolve(directory));
  if (
    !within ||
    within.startsWith('..') ||
    isAbsolute(within) ||
    !basename(directory).startsWith('authresidue-eol-')
  )
    throw new Error('Unsafe line-ending fixture cleanup');
  fs.rmSync(directory, { recursive: true, force: true });
}
