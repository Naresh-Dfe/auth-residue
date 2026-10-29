import type { ScenarioRuntime } from '../scenarios/runtime.js';
import type { Status } from '../core/results.js';
import type { StorageSummary } from '../browser/storage.js';
import { finding } from '../evidence/collector.js';

export async function compareStorage(
  runtime: ScenarioRuntime,
  before: StorageSummary[],
  after: StorageSummary[],
  phase: string,
): Promise<void> {
  for (const observation of after) {
    const baseline = before.find(
      (item) => item.category === observation.category,
    );
    const retentionForbidden = runtime.config.storage.retention === 'forbid';
    const status: Status =
      !baseline?.complete || !observation.complete
        ? 'INCONCLUSIVE'
        : !baseline.matched
          ? 'NOT_TESTED'
          : observation.matched
            ? retentionForbidden
              ? 'FAIL'
              : 'INCONCLUSIVE'
            : 'PASS';
    finding(runtime, {
      title: `${observation.category} marker retention`,
      phase: `${phase}-storage`,
      status,
      severity: 'low',
      expected: retentionForbidden
        ? 'A marker is removed from this storage category.'
        : 'Observe retention separately from verified exposure.',
      actual: !observation.complete
        ? 'Storage inspection was blocked or exceeded configured bounds.'
        : !baseline?.matched
          ? 'No A marker was established in this category before logout.'
          : observation.matched
            ? 'A marker remains in browser storage; cross-identity exposure is not established by this observation.'
            : 'The previously observed A marker is absent.',
      evidence: {
        category: observation.category,
        retained: observation.matched,
        baselineMarkerMatched: baseline?.matched ?? false,
        crossIdentityExposureEstablished: false,
        complete: observation.complete,
        entries: observation.entries,
        expectedIdentity: phase === 'switch' ? 'B' : 'anonymous',
        ...(observation.secure === undefined
          ? {}
          : {
              secureCookies: observation.secure,
              httpOnlyCookies: observation.httpOnly ?? 0,
              strictCookies: observation.sameSiteStrict ?? 0,
            }),
      },
      limitations: [
        'Retained storage alone is not proof of an exploitable cross-account leak. Cookie values, key names, database names, and stored payloads are never exported.',
      ],
    });
  }
}
