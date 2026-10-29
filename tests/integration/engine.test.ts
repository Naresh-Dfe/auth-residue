import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { run } from '../../src/core/engine.js';
import { exitCode } from '../../src/core/results.js';
import { renderHTML } from '../../src/reporters/reports.js';
import { renderTerminal } from '../../src/reporters/terminal.js';
import { validateConfig } from '../../src/config/schema.js';
import { boundedGet, restrictContext } from '../../src/browser/network.js';
import { doctor } from '../../src/cli/doctor.js';
import { fixtureConfig, testEnvironment } from '../fixtures/config.js';
import { startFixture } from '../fixtures/server.js';
import type { Mode } from '../fixtures/server.js';

const fixtures: Awaited<ReturnType<typeof startFixture>>[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});
async function scan(
  mode: Mode,
  scenarios: ReturnType<typeof fixtureConfig>['scenarios'],
) {
  const fixture = await startFixture(mode);
  fixtures.push(fixture);
  const result = await run(
    { ...fixtureConfig(fixture.baseURL), scenarios },
    { environment: testEnvironment },
  );
  return { result, fixture };
}

describe('real Chromium identity transitions', () => {
  it('executes all secure fixture scenarios without verified failures', async () => {
    const { result } = await scan('secure', [
      'logout-ui',
      'logout-session',
      'account-switch',
      'protected-routes',
      'protected-api',
      'stale-tab',
      'storage-isolation',
    ]);
    expect(
      result.findings.filter((finding) => finding.status === 'FAIL'),
    ).toEqual([]);
    expect(
      result.findings.filter((finding) => finding.phase === 'lifecycle'),
    ).toEqual([]);
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'former-session-replay' &&
          finding.status === 'PASS',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (finding) => finding.phase === 'switch-b' && finding.status === 'PASS',
      ),
    ).toBe(true);
    expect(exitCode(result)).toBe(0);
  });
  it('detects continued server access with former cookie state', async () => {
    const { result } = await scan('broken-logout', ['logout-session']);
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'former-session-replay' &&
          finding.status === 'FAIL' &&
          finding.severity === 'high',
      ),
    ).toBe(true);
    expect(exitCode(result)).toBe(1);
  });
  it.each(['account-switch', 'stale-tab'] as const)(
    'requires the private route readiness baseline before %s transitions',
    async (scenario) => {
      const fixture = await startFixture();
      fixtures.push(fixture);
      const result = await run(
        {
          ...fixtureConfig(fixture.baseURL),
          scenarios: [scenario],
          routes: [
            {
              path: '/dashboard',
              readySelector: '[data-testid="never-ready"]',
            },
          ],
        },
        { environment: testEnvironment },
      );
      const incomplete = result.findings.filter(
        (finding) => finding.phase === 'lifecycle',
      );
      expect(incomplete.map((finding) => finding.evidence.failedPhase)).toEqual(
        ['private-positive-controls'],
      );
      expect(fixture.issuedSessions.length).toBe(1);
      expect(result.findings.some((finding) => finding.status === 'FAIL')).toBe(
        false,
      );
      expect(exitCode(result)).toBe(2);
    },
  );
  it('detects A-only cached content under confirmed B identity (regression)', async () => {
    const { result } = await scan('cache-leak', ['account-switch']);
    // Report assertion metadata, never browser diagnostics or private values.
    const diagnostics = JSON.stringify(
      result.findings.map(({ phase, status, evidence }) => ({
        phase,
        status,
        failedPhase: evidence.failedPhase,
        deadlineExceeded: evidence.deadlineExceeded,
        identityBConfirmed: evidence.identityBConfirmed,
        markerAMatched: evidence.markerAMatched,
        markerBMatched: evidence.markerBMatched,
      })),
    );
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'switch-b' &&
          finding.status === 'FAIL' &&
          finding.evidence.identityBConfirmed === true,
      ),
      diagnostics,
    ).toBe(true);
    expect(
      result.findings
        .filter((finding) => finding.phase.includes('storage'))
        .every((finding) => finding.severity === 'none'),
    ).toBe(true);
  });
  it('detects anonymous private API content', async () => {
    const { result } = await scan('public-api', ['protected-api']);
    expect(
      result.findings.some(
        (finding) => finding.phase === 'anonymous' && finding.status === 'FAIL',
      ),
    ).toBe(true);
  });
  it('distinguishes already-rendered content from stale content after reload', async () => {
    const { result } = await scan('stale-tab', ['stale-tab']);
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'stale-before-reload' &&
          finding.status === 'INCONCLUSIVE',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'stale-reload' && finding.status === 'FAIL',
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (finding) =>
          finding.phase === 'post-logout' && finding.status === 'PASS',
      ),
    ).toBe(true);
  });
  it('never passes when identity cannot be confirmed', async () => {
    const { result } = await scan('wrong-identity', ['logout-session']);
    expect(
      result.findings.every((finding) => finding.status === 'INCONCLUSIVE'),
    ).toBe(true);
    expect(exitCode(result)).toBe(2);
  });
  it('never infers API authorization from HTTP 200 without positive markers', async () => {
    const { result } = await scan('ambiguous-api', ['protected-api']);
    expect(result.findings.some((finding) => finding.status === 'PASS')).toBe(
      false,
    );
    expect(result.findings.some((finding) => finding.status === 'FAIL')).toBe(
      false,
    );
    expect(exitCode(result)).toBe(2);
  });
  it('does not persist recognizable passwords, session IDs or response secrets in any reporter', async () => {
    const { result, fixture } = await scan('broken-logout', ['logout-session']);
    const output =
      JSON.stringify(result) + renderHTML(result) + renderTerminal(result);
    for (const secret of [
      ...Object.values(testEnvironment),
      ...fixture.issuedSessions,
      'NEVER_EXPORT_RESPONSE_SECRET',
    ])
      expect(output).not.toContain(secret);
  });
  it('produces stable finding IDs on repeated execution', async () => {
    const fixture = await startFixture('broken-logout');
    fixtures.push(fixture);
    const input = {
      ...fixtureConfig(fixture.baseURL),
      scenarios: ['logout-session'] as const,
    };
    const first = await run(
      { ...input, scenarios: [...input.scenarios] },
      { environment: testEnvironment },
    );
    const second = await run(
      { ...input, scenarios: [...input.scenarios] },
      { environment: testEnvironment },
    );
    expect(
      first.findings.map((finding) => [finding.id, finding.status]),
    ).toEqual(second.findings.map((finding) => [finding.id, finding.status]));
  });
  it('cleans up and returns partial results when aborted during a scenario', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const cancellation = new AbortController();
    const result = await run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['logout-session', 'logout-ui'],
      },
      {
        environment: testEnvironment,
        signal: cancellation.signal,
        onProgress: (event) => {
          if (event.state === 'start') cancellation.abort();
        },
      },
    );
    expect(result.interrupted).toBe(true);
    expect(exitCode(result)).toBe(2);
    expect(
      result.findings.some((finding) => finding.status === 'NOT_TESTED'),
    ).toBe(true);
  });
});

describe('bounded network transport and reporting', () => {
  it('doctor rejects a private route whose configured readiness is missing', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const { vi } = await import('vitest');
    const directory = await mkdtemp(
      join(tmpdir(), 'authresidue-doctor-ready-'),
    );
    if (
      !resolve(directory).startsWith(
        join(resolve(tmpdir()), 'authresidue-doctor-ready-'),
      )
    )
      throw new Error('Unsafe doctor fixture cleanup');
    for (const [name, value] of Object.entries(testEnvironment))
      vi.stubEnv(name, value);
    try {
      const checks = await doctor(
        validateConfig({
          ...fixtureConfig(fixture.baseURL),
          routes: [
            {
              path: '/dashboard',
              readySelector: '[data-testid="never-ready"]',
            },
          ],
          reports: { outputDir: join(directory, 'reports') },
        }),
      );
      expect(
        checks.find((check) => check.name === 'Selectors and authentication')
          ?.ok,
      ).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('does not follow redirects and bounds bytes and deadlines', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    expect(
      (
        await boundedGet(new URL('/redirect', fixture.baseURL), {
          timeout: 2000,
          maxBytes: 200,
        })
      ).redirected,
    ).toBe(true);
    const big = await boundedGet(new URL('/big', fixture.baseURL), {
      timeout: 2000,
      maxBytes: 200,
    });
    expect(big.body.length).toBe(200);
    expect(big.truncated).toBe(true);
    await expect(
      boundedGet(new URL('/slow', fixture.baseURL), {
        timeout: 100,
        maxBytes: 200,
      }),
    ).rejects.toThrow();
  });
  it('blocks unapproved browser targets and report injection while filters work offline', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      await restrictContext(
        context,
        validateConfig(fixtureConfig(fixture.baseURL)),
      );
      const page = await context.newPage();
      await expect(page.goto('http://unapproved.invalid/')).rejects.toThrow();
      const { result } = await scan('broken-logout', ['logout-session']);
      result.findings[0]!.title =
        '<img src=x onerror="globalThis.pwned=true"><script>globalThis.pwned=true</script>';
      let outbound = 0;
      page.on('request', () => outbound++);
      await page.setContent(renderHTML(result));
      expect(await page.evaluate(() => 'pwned' in globalThis)).toBe(false);
      await page.locator('[data-filter="status"]').selectOption('PASS');
      expect(await page.locator('tbody tr:visible').count()).toBe(0);
      expect(outbound).toBe(0);
    } finally {
      await browser.close();
    }
  });
  it('doctor identifies missing Chromium with actionable install instructions', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const { vi } = await import('vitest');
    const directory = await mkdtemp(join(tmpdir(), 'authresidue-doctor-'));
    const spy = vi
      .spyOn(chromium, 'executablePath')
      .mockReturnValue(join(directory, 'missing', 'chromium'));
    try {
      const result = await doctor(
        validateConfig({
          ...fixtureConfig(fixture.baseURL),
          reports: { outputDir: join(directory, 'reports') },
        }),
      );
      expect(
        result.find((check) => check.name === 'Chromium')?.message,
      ).toContain('npx playwright install chromium');
      expect(result.find((check) => check.name === 'Chromium')?.ok).toBe(false);
    } finally {
      spy.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
