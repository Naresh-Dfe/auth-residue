import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageGuides = [
  'docs/configuration.md',
  'docs/results.md',
  'docs/security-model.md',
  'docs/limitations.md',
  'docs/troubleshooting.md',
];

export function isPackagePathAllowed(filename) {
  const name = filename.replaceAll('\\', '/');
  if (['package.json', 'README.md', 'LICENSE', ...packageGuides].includes(name))
    return true;
  return (
    name.startsWith('dist/') &&
    !name
      .split('/')
      .some((part) =>
        [
          '..',
          'tests',
          'fixtures',
          'examples',
          'scripts',
          'node_modules',
        ].includes(part),
      ) &&
    /(?:\.js|\.d\.ts)$/.test(name)
  );
}

function privatePath(filename) {
  const parts = filename.replaceAll('\\', '/').toLowerCase().split('/');
  const name = parts.at(-1) ?? '';
  return (
    parts.some((part) =>
      [
        'node_modules',
        '.next',
        'dist',
        '.verification',
        '.git',
        '.aws',
        '.ssh',
        '.codex',
        '.agents',
        '.auth',
        '.vscode',
        '.idea',
        'authresidue-output',
        'coverage',
        'playwright-report',
        'test-results',
      ].includes(part),
    ) ||
    ['implementation.md', '.npmrc', '.ds_store', 'thumbs.db'].includes(name) ||
    (parts.length === 1 &&
      ['authresidue.config.ts', 'results.json', 'report.html'].includes(
        name,
      )) ||
    /\.(?:log|tgz|tsbuildinfo|pem|key|p12|pfx)$/.test(name) ||
    name === 'next-env.d.ts' ||
    (name !== '.env.example' &&
      (name.startsWith('.env') || name.endsWith('.env')))
  );
}

/** Return categories only; never return the matching secret or private value. */
export function inspectReleaseText(text, filename, packaged = false) {
  const found = new Set();
  if (
    filename.toLowerCase().endsWith('.html') &&
    /<title>\s*AuthResidue\b[^<]*Identity transition report\s*<\/title>/i.test(
      text,
    )
  )
    found.add('saved-scan-report');
  const patterns = [
    ['private-key', /-----BEGIN (?:(?:RSA|EC|OPENSSH) )?PRIVATE KEY-----/],
    [
      'github-token',
      /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
    ],
    ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
    [
      'jwt',
      /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/,
    ],
    [
      'personal-filesystem-path',
      /(?:\b[A-Za-z]:[\\/][^\s"'`<>]+|\/(?:Users|home)\/[^\s/"'`<>]+\/)/,
    ],
  ];
  for (const [kind, pattern] of patterns)
    if (pattern.test(text)) found.add(kind);
  for (const match of text.matchAll(
    /[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi,
  )) {
    const domain = match[1].toLowerCase();
    if (
      !/\.(?:invalid|example|test)$/.test(domain) &&
      !/^(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/.test(domain)
    )
      found.add('non-example-email');
  }
  if (
    filename.endsWith('.env.example') &&
    /^[ \t]*AUTHRESIDUE_[AB]_(?:EMAIL|PASSWORD)[ \t]*=[ \t]*[^\s#].*$/m.test(
      text,
    )
  )
    found.add('populated-credential-example');
  if (
    packaged &&
    /SYNTHETIC_PASSWORD_[AB]_ONLY|NEVER_EXPORT_RESPONSE_SECRET/.test(text)
  )
    found.add('development-fixture-value');
  if (filename.endsWith('.json')) {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return [...found];
    }
    if (json && typeof json === 'object') {
      if (Array.isArray(json.cookies) && Array.isArray(json.origins))
        found.add('browser-storage-state');
      if (json.schemaVersion && Array.isArray(json.findings) && json.runId)
        found.add('saved-scan-result');
    }
  }
  return [...found];
}

function git(root, args) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function auditRepository(root) {
  const records = [];
  const files = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ]);
  const usingGit = files.status === 0;
  const names = new Set();
  if (usingGit)
    for (const name of files.stdout.split('\0').filter(Boolean))
      names.add(name);
  else {
    if (fs.existsSync(resolve(root, '.git')))
      throw new Error('Cannot inspect Git publication inputs');
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = resolve(directory, entry.name);
        const name = relative(root, absolute).split(sep).join('/');
        if (privatePath(name)) continue;
        if (entry.isDirectory()) walk(absolute);
        else names.add(name);
      }
    };
    walk(root);
  }
  const inspect = (bytes, name, staged = false) => {
    if (bytes.includes(0)) return;
    for (const kind of inspectReleaseText(bytes.toString('utf8'), name))
      records.push({ file: name, kind, staged });
  };
  for (const name of names) {
    if (privatePath(name)) {
      records.push({
        file: name,
        kind: 'private-or-generated-file',
        staged: false,
      });
      continue;
    }
    const absolute = resolve(root, name);
    const within = relative(root, absolute);
    if (!within || within.startsWith('..') || isAbsolute(within))
      throw new Error('Publication input escaped repository');
    if (!fs.existsSync(absolute)) continue;
    if (fs.lstatSync(absolute).isSymbolicLink()) {
      records.push({
        file: name,
        kind: 'symbolic-link-needs-review',
        staged: false,
      });
      continue;
    }
    inspect(fs.readFileSync(absolute), name);
  }
  if (usingGit) {
    const index = git(root, ['ls-files', '--stage', '-z']);
    if (index.status !== 0) throw new Error('Cannot inspect staged content');
    for (const entry of index.stdout.split('\0').filter(Boolean)) {
      const separator = entry.indexOf('\t');
      const [, hash] = entry.slice(0, separator).split(' ');
      const name = entry.slice(separator + 1);
      if (privatePath(name)) {
        records.push({
          file: name,
          kind: 'private-or-generated-file',
          staged: true,
        });
        continue;
      }
      if (!hash || !/^[a-f0-9]{40,64}$/.test(hash))
        throw new Error('Invalid Git object');
      const blob = git(root, ['cat-file', 'blob', hash]);
      if (blob.status !== 0) throw new Error('Cannot inspect staged object');
      inspect(Buffer.from(blob.stdout, 'utf8'), name, true);
    }
  }
  return {
    filesChecked: names.size,
    checkedStagedContent: usingGit,
    findings: records,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = auditRepository(
      dirname(fileURLToPath(new URL('../package.json', import.meta.url))),
    );
    for (const finding of result.findings)
      console.error(
        `${finding.staged ? 'INDEX' : 'FILE'} ${finding.file}: ${finding.kind}`,
      );
    console.log(
      `Release data check: ${result.filesChecked} source candidates; ${result.findings.length} findings; staged content ${result.checkedStagedContent ? 'checked' : 'not present (Git not initialized)'}.`,
    );
    process.exitCode = result.findings.length ? 1 : 0;
  } catch {
    console.error(
      'Release data check could not inspect all publication inputs. No values were printed.',
    );
    process.exitCode = 2;
  }
}
