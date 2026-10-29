import { createHash } from 'node:crypto';
import type { Finding, Status } from '../core/results.js';
import type { ScenarioRuntime } from '../scenarios/runtime.js';
import { catalog } from '../scenarios/catalog.js';
import { safeRoute } from './redactor.js';

const reproduction: Record<ScenarioRuntime['id'], string[]> = {
  'logout-ui': [
    'Open each configured private view as A and verify its canary.',
    'Use the configured logout control and confirm anonymous UI.',
    'Revisit the private views, reload, and traverse browser history; inspect configured private selectors.',
  ],
  'logout-session': [
    'Call the configured GET probe as A and verify the private canary.',
    'Capture former cookies in memory, then use normal UI logout and confirm anonymous UI.',
    'In an isolated context, restore former cookies and repeat only the configured GET probe.',
  ],
  'account-switch': [
    'Warm the configured private views as A.',
    'Log out and confirm anonymous UI, then log in as B in the SAME browser context.',
    'Confirm B identity and inspect equivalent views and configured GET probes for A private markers.',
  ],
  'protected-routes': [
    'Visit private routes in a clean anonymous context.',
    'Authenticate A and verify the identity and private marker on every configured route.',
    'Log out, confirm anonymous UI, and revisit routes; then authenticate B and repeat the views.',
  ],
  'protected-api': [
    'Call configured GET probes anonymously.',
    'Authenticate A and establish each GET private-canary positive control.',
    'Log out and confirm anonymous UI; repeat GETs using current and isolated former cookies.',
    'Authenticate B in the original context and repeat GETs, expecting B data without A markers.',
  ],
  'stale-tab': [
    'Authenticate A and open each private view in a second tab sharing the context.',
    'Log out in the first tab and confirm anonymous UI.',
    'Inspect already-rendered content separately, then reload the stale tab and inspect private selectors.',
    'Repeat configured read-only GET probes using current cookies to check server authorization separately.',
  ],
  'storage-isolation': [
    'Authenticate A, warm private views, and establish per-category storage marker baselines.',
    'Use normal UI logout and confirm anonymous UI.',
    'Inspect the same origin and tab within configured bounds; interpret retention against the explicit storage policy.',
  ],
};

export function finding(
  runtime: Pick<ScenarioRuntime, 'id' | 'config' | 'findings'>,
  input: {
    title: string;
    phase: string;
    status: Status;
    expected: string;
    actual: string;
    route?: string;
    evidence?: Finding['evidence'];
    severity?: Finding['severity'];
    limitations?: string[];
  },
): void {
  const route = input.route
    ? safeRoute(input.route, runtime.config.baseURL)
    : undefined;
  const hash = createHash('sha256')
    .update(
      `${runtime.id}:${input.phase}:${route ?? ''}:${input.title}:${runtime.findings.length}`,
    )
    .digest('hex')
    .slice(0, 12);
  runtime.findings.push({
    id: `TS-${hash}`,
    scenarioId: runtime.id,
    scenarioName: catalog[runtime.id].name,
    status: input.status,
    severity: input.status === 'FAIL' ? (input.severity ?? 'high') : 'none',
    title: input.title,
    expected: input.expected,
    actual: input.actual,
    evidence: input.evidence ?? {},
    timestamp: new Date().toISOString(),
    ...(route ? { route } : {}),
    phase: input.phase,
    reproduction: [
      'Start with a clean Chromium context.',
      'Log in as synthetic account A and verify its identity and configured private marker.',
      ...reproduction[runtime.id],
      `Repeat the ${input.phase} assertion${route ? ` at ${route}` : ''}.`,
    ],
    remediation:
      input.status === 'FAIL'
        ? input.phase.includes('storage')
          ? 'Clear identity-scoped client storage on authentication transitions according to the configured retention policy.'
          : 'Enforce authorization on the server, revoke sessions on logout, and clear or partition private UI caches by identity.'
        : 'Review the stated coverage and limitations; add assertions for other private data and authorization boundaries.',
    limitations: [
      catalog[runtime.id].limitations,
      ...(input.limitations ?? []),
    ],
    durationMs: 0,
  });
}
