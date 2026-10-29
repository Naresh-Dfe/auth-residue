import { randomUUID } from 'node:crypto';
import type { BrowserContext } from 'playwright';
import { resolveCredentials, validateConfig } from '../config/schema.js';
import type { ConfigInput, ScenarioId } from '../config/schema.js';
import { reportLimitations, resultSchema } from './results.js';
import type { Finding, RunResult } from './results.js';
import { restrictContext, verifyReachable } from '../browser/network.js';
import { executeScenario } from '../scenarios/execute.js';
import { finding } from '../evidence/collector.js';
import { sanitize } from '../evidence/redactor.js';
import { launchControlledBrowser } from '../browser/launcher.js';

export interface RunOptions {
  headless?: boolean;
  signal?: AbortSignal;
  environment?: NodeJS.ProcessEnv;
  onProgress?: (event: {
    scenario: ScenarioId;
    state: 'start' | 'complete';
  }) => void;
}

/** Runs sequentially. Reports are returned; no filesystem or terminal writes occur. */
export async function run(
  input: ConfigInput,
  options: RunOptions = {},
): Promise<RunResult> {
  const config = validateConfig(input);
  const credentials = resolveCredentials(config, options.environment);
  const secrets = Object.values(credentials).flatMap((value) =>
    value ? [value.email, value.password] : [],
  );
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  await verifyReachable(config, options.signal);
  const controlled = await launchControlledBrowser(
    config,
    options.headless ?? true,
  );
  const { browser } = controlled;
  const findings: Finding[] = [];
  const activeContexts = new Set<BrowserContext>();
  let interrupted = options.signal?.aborted ?? false;
  const cancel = () => {
    interrupted = true;
    void controlled.close().catch(() => {
      /* Main finally also closes the browser after cancellation. */
    });
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  const createContext = async () => {
    const context = await browser.newContext({
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    activeContexts.add(context);
    context.on('close', () => activeContexts.delete(context));
    context.setDefaultTimeout(config.timeouts.action);
    context.setDefaultNavigationTimeout(config.timeouts.navigation);
    await restrictContext(context, config);
    return context;
  };
  const version = browser.version();
  try {
    for (const id of config.scenarios) {
      if (interrupted) {
        finding(
          { id, config, findings },
          {
            title: 'Scenario cancelled',
            phase: 'lifecycle',
            status: 'NOT_TESTED',
            expected: 'Scenario completes.',
            actual: 'Execution was cancelled before this scenario.',
          },
        );
        continue;
      }
      const scenarioStart = Date.now();
      const startIndex = findings.length;
      const scenarioFindings: Finding[] = [];
      let failedPhase = 'context-setup';
      let deadlineExceeded = false;
      options.onProgress?.({ scenario: id, state: 'start' });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const scenarioAbort = new AbortController();
      const abortScenario = () => scenarioAbort.abort();
      options.signal?.addEventListener('abort', abortScenario, { once: true });
      const createScenarioContext = async () => {
        if (scenarioAbort.signal.aborted)
          throw new Error('Scenario already ended');
        const context = await createContext();
        if (scenarioAbort.signal.aborted) {
          await context.close();
          throw new Error('Context created after scenario ended');
        }
        return context;
      };
      try {
        await Promise.race([
          (async () => {
            const context = await createScenarioContext();
            const page = await context.newPage();
            await executeScenario({
              id,
              config,
              credentials,
              context,
              page,
              browser,
              createContext: createScenarioContext,
              findings: scenarioFindings,
              signal: scenarioAbort.signal,
              setPhase: (phase) => {
                failedPhase = phase;
              },
            });
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              deadlineExceeded = true;
              scenarioAbort.abort();
              for (const active of activeContexts)
                void active.close().catch(() => {
                  /* Browser finally is the cleanup fallback. */
                });
              reject(new Error('Scenario deadline'));
            }, config.timeouts.scenario);
          }),
        ]);
      } catch {
        finding(
          { id, config, findings: scenarioFindings },
          {
            title: interrupted
              ? 'Scenario interrupted'
              : 'Scenario could not complete',
            phase: 'lifecycle',
            status: 'INCONCLUSIVE',
            expected:
              'Authenticated identity, positive controls, and all configured assertions complete.',
            actual: interrupted
              ? 'Execution was interrupted; partial findings are retained.'
              : 'An identity assertion, selector, transport, browser operation, or scenario deadline failed. Verify setup with authresidue doctor. Raw errors are withheld because browser diagnostics can contain secrets.',
            evidence: { failedPhase, deadlineExceeded },
          },
        );
      } finally {
        if (timer) clearTimeout(timer);
        scenarioAbort.abort();
        options.signal?.removeEventListener('abort', abortScenario);
        await Promise.allSettled(
          [...activeContexts].map((context) => context.close()),
        );
      }
      findings.push(...scenarioFindings);
      if (findings.length === startIndex)
        finding(
          { id, config, findings },
          {
            title: 'No useful assertions executed',
            phase: 'coverage',
            status: 'NOT_TESTED',
            expected: 'At least one applicable configured assertion.',
            actual:
              'No applicable positive control or enabled storage category was available.',
          },
        );
      for (const result of findings.slice(startIndex))
        result.durationMs = Date.now() - scenarioStart;
      options.onProgress?.({ scenario: id, state: 'complete' });
    }
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await controlled.close();
  }
  const result: RunResult = {
    schemaVersion: '1.0',
    toolVersion: '0.1.0',
    runId: randomUUID(),
    startedAt,
    durationMs: Date.now() - started,
    targetOrigin: new URL(config.baseURL).origin,
    environment: {
      node: process.versions.node,
      platform: process.platform,
      browser: `Chromium ${version}`,
    },
    selectedScenarios: config.scenarios,
    configuration: {
      routeCount: config.routes.length,
      probeCount: config.probes.length,
      actionTimeoutMs: config.timeouts.action,
      navigationTimeoutMs: config.timeouts.navigation,
      scenarioTimeoutMs: config.timeouts.scenario,
      storageCategories: (
        [
          'localStorage',
          'sessionStorage',
          'cookies',
          'indexedDB',
          'cacheStorage',
        ] as const
      ).filter((category) => config.storage[category]),
      retentionPolicy: config.storage.retention,
    },
    findings,
    interrupted,
    limitations: reportLimitations,
  };
  return resultSchema.parse(sanitize(result, secrets));
}
