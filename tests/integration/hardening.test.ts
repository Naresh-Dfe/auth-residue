import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { run } from '../../src/core/engine.js';
import { validateConfig } from '../../src/config/schema.js';
import { resolveCredentials } from '../../src/config/schema.js';
import { inspectStorage } from '../../src/browser/storage.js';
import { restrictContext } from '../../src/browser/network.js';
import { login } from '../../src/auth/session.js';
import { startFixture } from '../fixtures/server.js';
import { fixtureConfig, testEnvironment } from '../fixtures/config.js';

const fixtures: Awaited<ReturnType<typeof startFixture>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.close()));
});

describe('hardening regressions', () => {
  it('requires readiness in the second tab before performing logout', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const launch = chromium.launch.bind(chromium);
    vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
      const browser = await launch(options);
      const createContext = browser.newContext.bind(browser);
      vi.spyOn(browser, 'newContext').mockImplementation(
        async (contextOptions) => {
          const context = await createContext(contextOptions);
          const createPage = context.newPage.bind(context);
          let firstPage = true;
          vi.spyOn(context, 'newPage').mockImplementation(async () => {
            const page = await createPage();
            if (firstPage) {
              firstPage = false;
              await page.addInitScript(() => {
                document.addEventListener('DOMContentLoaded', () => {
                  const ready = document.createElement('span');
                  ready.setAttribute('data-testid', 'fixture-ready');
                  ready.textContent = 'Ready';
                  document.body.append(ready);
                });
              });
            }
            return page;
          });
          return context;
        },
      );
      return browser;
    });
    const result = await run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['stale-tab'],
        routes: [
          {
            path: '/dashboard',
            readySelector: '[data-testid="fixture-ready"]',
          },
        ],
      },
      { environment: testEnvironment },
    );
    expect(
      result.findings
        .filter((finding) => finding.phase === 'lifecycle')
        .map((finding) => finding.evidence.failedPhase),
    ).toEqual(['transition-preparation']);
    expect(
      result.findings.some((finding) => finding.phase === 'post-logout'),
    ).toBe(false);
    expect(
      result.findings.every((finding) => finding.status === 'INCONCLUSIVE'),
    ).toBe(true);
  });

  it('applies the scenario deadline while browser context creation is still pending', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const launch = chromium.launch.bind(chromium);
    let launched: Browser | undefined;
    let release: () => void = () => {
      throw new Error('Context gate was not initialized');
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
      const browser = await launch(options);
      launched = browser;
      const create = browser.newContext.bind(browser);
      vi.spyOn(browser, 'newContext').mockImplementation(
        async (contextOptions) => {
          await gate;
          return create(contextOptions);
        },
      );
      return browser;
    });
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const execution = run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['logout-session'],
        timeouts: { action: 10000, navigation: 10000, scenario: 1000 },
      },
      { environment: testEnvironment },
    );
    try {
      const result = await Promise.race([
        execution,
        new Promise<never>((_, reject) => {
          watchdog = setTimeout(
            () =>
              reject(new Error('Context setup escaped the scenario deadline')),
            5000,
          );
        }),
      ]);
      expect(
        result.findings.some(
          (finding) =>
            finding.evidence.deadlineExceeded === true &&
            finding.evidence.failedPhase === 'context-setup',
        ),
      ).toBe(true);
      expect(launched?.isConnected()).toBe(false);
    } finally {
      if (watchdog) clearTimeout(watchdog);
      release();
      await execution;
    }
  });
  it('does not classify unsupported encoded denial bodies as clean isolation', async () => {
    const fixture = await startFixture('encoded-denial');
    fixtures.push(fixture);
    const result = await run(
      { ...fixtureConfig(fixture.baseURL), scenarios: ['protected-api'] },
      { environment: testEnvironment },
    );
    const denials = result.findings.filter((finding) =>
      ['anonymous', 'post-logout', 'former-session-replay'].includes(
        finding.phase,
      ),
    );
    expect(denials).toHaveLength(3);
    expect(
      denials.every(
        (finding) =>
          finding.status === 'INCONCLUSIVE' &&
          finding.evidence.encoded === true,
      ),
    ).toBe(true);
  });
  it('never attributes revocation failure to an unconfirmed logout transition', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const result = await run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['logout-session'],
        auth: {
          hooks: {
            logout: async () => {
              /* Deliberately incorrect developer hook leaves A logged in. */
            },
          },
        },
      },
      { environment: testEnvironment },
    );
    expect(result.findings.some((finding) => finding.status === 'FAIL')).toBe(
      false,
    );
    expect(
      result.findings.some(
        (finding) => finding.phase === 'former-session-replay',
      ),
    ).toBe(false);
    expect(
      result.findings.some(
        (finding) =>
          finding.title === 'Logout transition unconfirmed' &&
          finding.status === 'INCONCLUSIVE',
      ),
    ).toBe(true);
  });
  it('closes the real browser and contexts after a scenario deadline', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    let launched: Browser | undefined;
    const launch = chromium.launch.bind(chromium);
    vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
      launched = await launch(options);
      return launched;
    });
    const result = await run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['logout-session'],
        timeouts: { action: 10000, navigation: 10000, scenario: 1000 },
        auth: {
          hooks: {
            login: async ({ page }) => {
              await page.waitForFunction(() => false);
            },
          },
        },
      },
      { environment: testEnvironment },
    );
    expect(
      result.findings.some(
        (finding) =>
          finding.evidence.deadlineExceeded === true &&
          finding.status === 'INCONCLUSIVE',
      ),
    ).toBe(true);
    expect(launched?.isConnected()).toBe(false);
    expect(launched?.contexts()).toHaveLength(0);
  });
  it('classifies explicit storage retention policy violations as low impact', async () => {
    const fixture = await startFixture('cache-leak');
    fixtures.push(fixture);
    const result = await run(
      {
        ...fixtureConfig(fixture.baseURL),
        scenarios: ['storage-isolation'],
        storage: { retention: 'forbid' },
      },
      { environment: testEnvironment },
    );
    const retained = result.findings.filter(
      (finding) => finding.status === 'FAIL',
    );
    expect(retained).toHaveLength(1);
    expect(retained[0]?.severity).toBe('low');
    expect(retained[0]?.evidence.category).toBe('localStorage');
  });
  it('inspects IndexedDB, CacheStorage and cookie attributes without exporting values or keys', async () => {
    const fixture = await startFixture();
    fixtures.push(fixture);
    const config = validateConfig({
      ...fixtureConfig(fixture.baseURL),
      storage: { indexedDB: true, cacheStorage: true },
    });
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      context.setDefaultTimeout(config.timeouts.action);
      await restrictContext(context, config);
      const page = await context.newPage();
      await login(
        page,
        config,
        resolveCredentials(config, testEnvironment),
        'a',
      );
      await page.evaluate(async (marker) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('DO_NOT_EXPORT_DATABASE', 1);
          request.onupgradeneeded = () =>
            request.result.createObjectStore('DO_NOT_EXPORT_STORE');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error('test store unavailable'));
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction(
              'DO_NOT_EXPORT_STORE',
              'readwrite',
            );
            transaction
              .objectStore('DO_NOT_EXPORT_STORE')
              .put(marker, 'DO_NOT_EXPORT_KEY');
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(new Error('test write failed'));
          });
        } finally {
          database.close();
        }
        const cache = await caches.open('DO_NOT_EXPORT_CACHE');
        await cache.put('/cached-private', new Response(marker));
      }, config.accounts.a.privateMarker);
      const summaries = await inspectStorage(
        page,
        config,
        config.accounts.a.privateMarker,
      );
      expect(
        summaries.find((summary) => summary.category === 'indexedDB')?.matched,
      ).toBe(true);
      expect(
        summaries.find((summary) => summary.category === 'cacheStorage')
          ?.matched,
      ).toBe(true);
      expect(
        summaries.find((summary) => summary.category === 'cookies')?.httpOnly,
      ).toBe(1);
      const serialized = JSON.stringify(summaries);
      expect(serialized).not.toContain(config.accounts.a.privateMarker);
      expect(serialized).not.toContain('DO_NOT_EXPORT');
      await page.evaluate(() =>
        localStorage.setItem('large', 'x'.repeat(2000)),
      );
      const bounded = await inspectStorage(
        page,
        { ...config, storage: { ...config.storage, maxBytes: 1024 } },
        config.accounts.a.privateMarker,
      );
      expect(
        bounded.find((summary) => summary.category === 'localStorage')
          ?.complete,
      ).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
