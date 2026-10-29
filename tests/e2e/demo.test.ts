import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import { resultSchema } from '../../src/core/results.js';
import { fixtureConfig, testEnvironment } from '../fixtures/config.js';

const demo = resolve('examples/nextjs-demo');
const nextCLI = join(demo, 'node_modules/next/dist/bin/next');
const cli = resolve('dist/cli/main.js');
let directory: string;

function execute(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      ...options,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        ...testEnvironment,
        ...options.env,
      },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function startDemo(mode: string) {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const port = address.port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(
    process.execPath,
    [nextCLI, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: demo,
      env: {
        ...process.env,
        ...testEnvironment,
        NEXT_TELEMETRY_DISABLED: '1',
        AUTHRESIDUE_DEMO_MODE: mode,
      },
      windowsHide: true,
      stdio: 'ignore',
    },
  );
  const baseURL = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30000;
  try {
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error('Demo server exited before becoming ready');
      try {
        const response = await fetch(`${baseURL}/login`, {
          signal: AbortSignal.timeout(2000),
        });
        await response.arrayBuffer();
        if (response.ok) return { baseURL, close: () => stop(child) };
      } catch {
        /* Retry only server startup transport failures. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Demo readiness deadline exceeded');
  } catch (error) {
    await stop(child);
    throw error;
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'authresidue-demo-e2e-'));
  const build = await execute([nextCLI, 'build'], { cwd: demo });
  if (build.code !== 0)
    throw new Error(
      `Next.js demo build failed:\n${build.stdout}\n${build.stderr}`,
    );
}, 240000);
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('compiled package against the Next.js demo', () => {
  it.each([
    ['secure', 'logout-session', false],
    ['cache-leak', 'account-switch', true],
    ['broken-logout', 'logout-session', true],
    ['public-api', 'protected-api', true],
    ['stale-tab', 'stale-tab', true],
  ] as const)(
    '%s mode produces the expected verified finding behavior',
    async (mode, scenario, shouldFail) => {
      const server = await startDemo(mode);
      try {
        // Regression: Next's internal URL must not reject a valid public loopback Origin or redirect to another host.
        const authentication = await fetch(`${server.baseURL}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: server.baseURL,
          },
          body: new URLSearchParams({
            email: testEnvironment.AUTHRESIDUE_A_EMAIL,
            password: testEnvironment.AUTHRESIDUE_A_PASSWORD,
          }),
          redirect: 'manual',
        });
        expect(authentication.status).toBe(303);
        expect(new URL(authentication.headers.get('location')!).origin).toBe(
          server.baseURL,
        );
        const input = {
          ...fixtureConfig(server.baseURL),
          ...(mode === 'secure' ? {} : { scenarios: [scenario] }),
          routes: [
            { path: '/dashboard', readySelector: '[data-testid="page-ready"]' },
          ],
        };
        const config = join(directory, `${mode}.config.ts`);
        await writeFile(config, `export default ${JSON.stringify(input)};\n`);
        const output = join(directory, mode);
        const execution = await execute([
          cli,
          'test',
          '--config',
          config,
          '--json',
          '--output',
          output,
        ]);
        const result = resultSchema.parse(JSON.parse(execution.stdout));
        expect(execution.code, execution.stderr).toBe(shouldFail ? 1 : 0);
        expect(
          result.findings.some((finding) => finding.status === 'FAIL'),
        ).toBe(shouldFail);
        expect(
          result.findings.some((finding) => finding.phase === 'lifecycle'),
        ).toBe(false);
        const serialized =
          (await readFile(join(output, 'results.json'), 'utf8')) +
          (await readFile(join(output, 'report.html'), 'utf8')) +
          execution.stdout +
          execution.stderr;
        for (const secret of Object.values(testEnvironment))
          expect(serialized).not.toContain(secret);
        if (mode === 'secure') {
          const diagnosis = await execute([cli, 'doctor', '--config', config]);
          expect(diagnosis.code, diagnosis.stdout + diagnosis.stderr).toBe(0);
          const regenerated = await execute([
            cli,
            'report',
            join(output, 'results.json'),
            '--output',
            join(directory, 'offline'),
          ]);
          expect(regenerated.code).toBe(0);
          const browser = await chromium.launch();
          try {
            const context = await browser.newContext({ offline: true });
            const page = await context.newPage();
            await page.goto(
              pathToFileURL(join(directory, 'offline/report.html')).href,
            );
            expect(await page.title()).toContain('AuthResidue');
            await page.locator('[data-filter="status"]').selectOption('FAIL');
            expect(await page.locator('tbody tr:visible').count()).toBe(0);
          } finally {
            await browser.close();
          }
        }
      } finally {
        await server.close();
      }
    },
    120000,
  );

  it('packaged init never overwrites configuration and supports help/version/list', async () => {
    const initial = await execute([cli, 'init', '--non-interactive'], {
      cwd: directory,
    });
    expect(initial.code).toBe(0);
    const first = await readFile(
      join(directory, 'authresidue.config.ts'),
      'utf8',
    );
    expect(
      (await execute([cli, 'init', '--non-interactive'], { cwd: directory }))
        .code,
    ).toBe(2);
    expect(
      await readFile(join(directory, 'authresidue.config.ts'), 'utf8'),
    ).toBe(first);
    for (const args of [
      ['--help'],
      ['--version'],
      ['list'],
      ['test', '--help'],
    ])
      expect((await execute([cli, ...args])).code).toBe(0);
    const invalid = await execute([cli, 'test', '--timeout', 'invalid']);
    expect(invalid.code).toBe(2);
  });
});
