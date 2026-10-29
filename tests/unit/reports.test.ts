import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  exitCode,
  resultSchema,
  reportLimitations,
} from '../../src/core/results.js';
import type { RunResult } from '../../src/core/results.js';
import {
  redactText,
  sanitize,
  safeRoute,
} from '../../src/evidence/redactor.js';
import {
  escapeHTML,
  readResults,
  renderHTML,
  writeReports,
} from '../../src/reporters/reports.js';
import { renderTerminal } from '../../src/reporters/terminal.js';

export function sampleResult(): RunResult {
  return {
    schemaVersion: '1.0',
    toolVersion: '0.1.1',
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    durationMs: 10,
    targetOrigin: 'http://127.0.0.1:3000',
    environment: {
      node: '24.22.1',
      browser: 'Chromium synthetic unit fixture',
      platform: 'win32',
    },
    selectedScenarios: ['logout-session'],
    configuration: {
      routeCount: 1,
      probeCount: 1,
      actionTimeoutMs: 10000,
      navigationTimeoutMs: 15000,
      scenarioTimeoutMs: 90000,
      storageCategories: ['localStorage', 'sessionStorage', 'cookies'],
      retentionPolicy: 'observe',
    },
    interrupted: false,
    limitations: reportLimitations,
    findings: [
      {
        id: 'TS-fixture',
        scenarioId: 'logout-session',
        scenarioName: 'Session invalidation',
        status: 'PASS',
        severity: 'none',
        title: 'Configured marker denied',
        expected: 'No A marker',
        actual: 'Denied',
        evidence: { markerMatched: false },
        timestamp: new Date().toISOString(),
        phase: 'replay',
        reproduction: ['Authenticate', 'Logout', 'Replay'],
        remediation: 'Revoke sessions',
        limitations: ['Cookie-based probe only'],
        durationMs: 10,
      },
    ],
  };
}

describe('reports and statuses', () => {
  it.each(['0.1.0', '0.1.1'] as const)(
    'reads and renders schema 1.0 reports from tool %s',
    async (toolVersion) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'authresidue-report-version-'),
      );
      if (
        !resolve(directory).startsWith(
          join(resolve(tmpdir()), 'authresidue-report-version-'),
        )
      )
        throw new Error('Unsafe version-report fixture cleanup');
      try {
        const result = { ...sampleResult(), toolVersion };
        const paths = await writeReports(result, directory);
        expect((await readResults(paths.json)).toolVersion).toBe(toolVersion);
        expect(await readFile(paths.html!, 'utf8')).toContain(
          `v${toolVersion}`,
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('classifies failures, interruption, incomplete coverage, and strict mode', () => {
    const result = sampleResult();
    expect(exitCode(result)).toBe(0);
    result.findings[0]!.status = 'INCONCLUSIVE';
    expect(exitCode(result)).toBe(2);
    result.findings.push({ ...result.findings[0]!, status: 'PASS' });
    expect(exitCode(result)).toBe(0);
    expect(exitCode(result, true)).toBe(2);
    result.findings[0]!.status = 'FAIL';
    expect(exitCode(result)).toBe(1);
    result.findings = [];
    expect(exitCode(result)).toBe(2);
    result.interrupted = true;
    expect(exitCode(result)).toBe(2);
  });
  it('validates schema version and limits severity to confirmed failure', () => {
    expect(resultSchema.safeParse(sampleResult()).success).toBe(true);
    expect(
      resultSchema.safeParse({ ...sampleResult(), schemaVersion: '2.0' })
        .success,
    ).toBe(false);
    const result = sampleResult();
    result.findings[0]!.severity = 'high';
    expect(resultSchema.safeParse(result).success).toBe(false);
  });
  it('redacts known secrets, encoded secrets, headers, keys and URL queries', () => {
    const secret = 'SYNTHETIC secret/+value';
    const output = JSON.stringify(
      sanitize(
        {
          text: `x ${secret} ${encodeURIComponent(secret)} Bearer abc.def`,
          password: 'hidden',
          nested: {
            authorization: 'hidden',
            url: 'https://example.invalid/?any=hidden&token=hidden',
          },
        },
        [secret],
      ),
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain('abc.def');
    expect(output).not.toContain('hidden');
    expect(redactText('Bearer x')).toBe('Bearer [REDACTED]');
    expect(safeRoute('/dashboard?token=hidden', 'http://localhost')).toBe(
      '/dashboard',
    );
  });
  it('escapes attacker strings in HTML and never interpolates data into script', () => {
    const result = sampleResult();
    const payload =
      '<img src=x onerror="globalThis.pwned=1"><script>alert(1)</script>';
    result.findings[0]!.title = payload;
    const html = renderHTML(result);
    expect(html).not.toContain(payload);
    expect(html).toContain('&lt;img');
    expect(html).toContain('Content-Security-Policy');
    expect(html).not.toContain('innerHTML');
    expect(escapeHTML(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('strips terminal control sequences from report content', () => {
    const result = sampleResult();
    result.findings[0]!.title = '\u001b[31mevil';
    expect(renderTerminal(result)).not.toContain('\u001b');
  });
  it('round-trips sanitized JSON and offline HTML and rejects corrupt files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'authresidue-report-'));
    try {
      const result = sampleResult();
      const paths = await writeReports(result, directory);
      expect(await readResults(paths.json)).toEqual(result);
      expect(await readFile(paths.html!, 'utf8')).toContain('AuthResidue');
      await writeFile(join(directory, 'corrupt.json'), '<html>bad</html>');
      await expect(
        readResults(join(directory, 'corrupt.json')),
      ).rejects.toThrow('corrupt');
      await expect(
        readResults(join(directory, 'missing.json')),
      ).rejects.toThrow('missing');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
