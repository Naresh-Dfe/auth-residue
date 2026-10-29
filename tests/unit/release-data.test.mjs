import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
  inspectReleaseText,
  isPackagePathAllowed,
  auditRepository,
} from '../../scripts/check-release.mjs';

describe('publication data checks', () => {
  it('allows only runtime files and selected user documentation in npm', () => {
    for (const name of [
      'package.json',
      'dist/cli/main.js',
      'dist/index.d.ts',
      'README.md',
      'LICENSE',
      'docs/configuration.md',
    ])
      expect(isPackagePathAllowed(name)).toBe(true);
    for (const name of [
      'tests/fixtures/config.ts',
      'scripts/check-release.mjs',
      'examples/demo.ts',
      '.env',
      'IMPLEMENTATION.md',
      'docs/release-checklist.md',
      'dist/../tests/key.js',
      'dist/fixtures/data.js',
      'dist/index.js.map',
    ])
      expect(isPackagePathAllowed(name)).toBe(false);
  });
  it('allows synthetic example identities without treating them as personal data', () => {
    expect(
      inspectReleaseText(
        'alice@authresidue.invalid reader@example.com tester@app.example',
        'README.md',
      ),
    ).toEqual([]);
  });
  it('detects personal filesystem paths and email addresses without returning the values', () => {
    const personal = ['C:', 'Users', 'private-person', 'project'].join('/');
    const email = ['private-person', 'mail-provider.com'].join('@');
    const findings = inspectReleaseText(`${personal} ${email}`, 'fixture.txt');
    expect(findings).toContain('personal-filesystem-path');
    expect(findings).toContain('non-example-email');
    expect(JSON.stringify(findings)).not.toContain(personal);
    expect(JSON.stringify(findings)).not.toContain(email);
  });
  it('detects recognizable keys and tokens without embedding those secrets in test source', () => {
    const samples = [
      [['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'private-key'],
      [['ghp', 'x'.repeat(40)].join('_'), 'github-token'],
      [['AK', 'IA', 'X'.repeat(16)].join(''), 'aws-access-key'],
    ];
    for (const [text, kind] of samples)
      expect(inspectReleaseText(text, 'fixture.txt')).toContain(kind);
  });
  it('requires blank credential examples', () => {
    expect(
      inspectReleaseText(
        'AUTHRESIDUE_A_PASSWORD=\nAUTHRESIDUE_A_EMAIL=\n',
        '.env.example',
      ),
    ).toEqual([]);
    expect(
      inspectReleaseText(
        ['AUTHRESIDUE_A_PASSWORD', 'not-a-real-secret'].join('='),
        '.env.example',
      ),
    ).toContain('populated-credential-example');
  });
  it('rejects saved browser state and scan results as publication data', () => {
    expect(
      inspectReleaseText(
        '<!doctype html><title>AuthResidue · Identity transition report</title>',
        'report.html',
      ),
    ).toContain('saved-scan-report');
    expect(
      inspectReleaseText(
        JSON.stringify({ cookies: [], origins: [] }),
        'state.json',
      ),
    ).toContain('browser-storage-state');
    expect(
      inspectReleaseText(
        JSON.stringify({
          schemaVersion: '1.0',
          runId: 'synthetic',
          findings: [],
        }),
        'results.json',
      ),
    ).toContain('saved-scan-result');
  });
  it('keeps synthetic test credentials in development fixtures rather than npm contents', () => {
    const fixtureValue = ['SYNTHETIC', 'PASSWORD', 'A', 'ONLY'].join('_');
    expect(inspectReleaseText(fixtureValue, 'tests/fixture.ts')).toEqual([]);
    expect(inspectReleaseText(fixtureValue, 'README.md', true)).toContain(
      'development-fixture-value',
    );
  });
  it('checks staged blobs even when working files are clean, and rejects already-tracked private files', () => {
    const directory = fs.mkdtempSync(
      join(tmpdir(), 'authresidue-release-test-'),
    );
    const git = (...args) => {
      const result = spawnSync('git', args, {
        cwd: directory,
        stdio: 'ignore',
        windowsHide: true,
      });
      if (result.status !== 0)
        throw new Error('Temporary Git fixture setup failed');
    };
    try {
      git('init', '--quiet');
      fs.writeFileSync(join(directory, '.gitignore'), '.env*\n');
      fs.writeFileSync(
        join(directory, 'public.txt'),
        ['ghp', 'x'.repeat(40)].join('_'),
      );
      git('add', 'public.txt');
      fs.writeFileSync(
        join(directory, 'public.txt'),
        'Clean working content.\n',
      );
      fs.writeFileSync(
        join(directory, '.env.local'),
        'TEST_ONLY=placeholder\n',
      );
      git('add', '--force', '.env.local');
      const result = auditRepository(directory);
      expect(result.checkedStagedContent).toBe(true);
      expect(
        result.findings.some(
          (finding) =>
            finding.file === 'public.txt' &&
            finding.kind === 'github-token' &&
            finding.staged,
        ),
      ).toBe(true);
      expect(
        result.findings.some(
          (finding) =>
            finding.file === '.env.local' &&
            finding.kind === 'private-or-generated-file' &&
            finding.staged,
        ),
      ).toBe(true);
      expect(
        result.findings.some(
          (finding) => finding.file === 'public.txt' && !finding.staged,
        ),
      ).toBe(false);
    } finally {
      removeTestDirectory(directory);
    }
  });
});

function removeTestDirectory(directory) {
  const within = relative(resolve(tmpdir()), resolve(directory));
  if (
    !within ||
    within.startsWith('..') ||
    isAbsolute(within) ||
    !basename(directory).startsWith('authresidue-release-test-')
  )
    throw new Error('Unsafe release-test cleanup path');
  fs.rmSync(directory, { recursive: true, force: true });
}
