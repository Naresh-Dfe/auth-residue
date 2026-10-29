import type { ScenarioId } from '../config/schema.js';

export const catalog: Record<
  ScenarioId,
  { name: string; description: string; requires: string; limitations: string }
> = {
  'logout-ui': {
    name: 'Logout UI',
    description: 'Private views, reload, and history after logout.',
    requires: 'A, routes, private selectors, anonymous selector',
    limitations:
      'Only configured visible synthetic markers; history behavior is browser dependent.',
  },
  'logout-session': {
    name: 'Session invalidation',
    description: 'Replay pre-logout cookie state against read-only GET probes.',
    requires: 'A, probes, private marker',
    limitations: 'Cookie-based API authentication; state remains in memory.',
  },
  'account-switch': {
    name: 'Account isolation',
    description:
      'Check A markers in B views and GET responses in the same context.',
    requires: 'A and B, routes; optional probes',
    limitations: 'Does not infer leakage from retained storage alone.',
  },
  'protected-routes': {
    name: 'Protected routes',
    description: 'Anonymous, A, post-logout, and B private view checks.',
    requires: 'A and B, routes',
    limitations:
      'Only configured selectors and markers; HTTP status is not an identity assertion.',
  },
  'protected-api': {
    name: 'Protected APIs',
    description: 'Anonymous, A, post-logout, replay, and B read-only probes.',
    requires: 'A and B, GET probes',
    limitations:
      'No mutation requests, bearer extraction, or redirect following.',
  },
  'stale-tab': {
    name: 'Stale tab',
    description:
      'Observe rendered content separately from reloaded UI and GET authorization.',
    requires: 'A, routes; optional probes',
    limitations:
      'An unchanged rendered page is an observation, not proof of server access.',
  },
  'storage-isolation': {
    name: 'Storage retention',
    description:
      'Inspect configured bounded stores for A markers after logout.',
    requires: 'A, routes, enabled storage categories',
    limitations:
      'Retention is observational unless storage.retention is forbid; service workers unsupported.',
  },
};
