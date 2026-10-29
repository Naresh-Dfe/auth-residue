import type { Config } from '../config/schema.js';
import type { ScenarioRuntime } from '../scenarios/runtime.js';
import { finding } from '../evidence/collector.js';
import type { Status } from '../core/results.js';
import { probe } from '../browser/network.js';
import type { GetResponse } from '../browser/network.js';

export function checkDenied(
  runtime: ScenarioRuntime,
  definition: Config['probes'][number],
  response: GetResponse,
  phase: string,
): void {
  const matchedA =
    !response.encoded &&
    response.body.includes(runtime.config.accounts.a.privateMarker);
  const matchedB =
    !response.encoded && runtime.config.accounts.b
      ? response.body.includes(runtime.config.accounts.b.privateMarker)
      : false;
  const exposed = matchedA || matchedB;
  const accepted = definition.deniedStatuses.includes(response.status);
  const status: Status = exposed
    ? 'FAIL'
    : !response.truncated &&
        !response.redirected &&
        !response.encoded &&
        accepted
      ? 'PASS'
      : 'INCONCLUSIVE';
  finding(runtime, {
    title: 'Protected GET denies former or anonymous identity',
    phase,
    route: definition.path,
    status,
    expected: 'No configured private marker and a configured denied status.',
    actual: exposed
      ? 'A configured private marker was returned by the server.'
      : accepted &&
          !response.truncated &&
          !response.redirected &&
          !response.encoded
        ? 'Configured denial response observed without a private marker.'
        : 'Response lacks a private marker, but its status, encoding, redirect, or size prevents confirming the configured denial.',
    evidence: {
      status: response.status,
      markerAMatched: matchedA,
      markerBMatched: matchedB,
      bodyTruncated: response.truncated,
      redirected: response.redirected,
      encoded: response.encoded,
      positiveControl: true,
      expectedIdentity:
        phase === 'former-session-replay' ? 'revoked A' : 'anonymous',
      observedMarkerIdentity: matchedA ? 'A' : matchedB ? 'B' : 'none',
    },
    limitations: [
      'HTTP status alone does not establish exposure; redirects are never followed.',
    ],
  });
}

export async function positiveProbes(
  runtime: ScenarioRuntime,
): Promise<Config['probes']> {
  const valid: Config['probes'] = [];
  for (const definition of runtime.config.probes) {
    const response = await probe(
      runtime.context,
      runtime.config,
      definition,
      runtime.signal,
    );
    const markerMatched = response.body.includes(
      runtime.config.accounts.a.privateMarker,
    );
    if (
      !response.truncated &&
      !response.redirected &&
      !response.encoded &&
      markerMatched &&
      response.status >= 200 &&
      response.status < 300
    )
      valid.push(definition);
    else
      finding(runtime, {
        title: 'Authenticated API positive control unavailable',
        phase: 'baseline-a',
        route: definition.path,
        status: 'INCONCLUSIVE',
        expected:
          'A bounded successful GET response contains A private marker.',
        actual:
          'Could not establish the configured authenticated API baseline.',
        evidence: {
          status: response.status,
          markerMatched,
          bodyTruncated: response.truncated,
          encoded: response.encoded,
        },
      });
  }
  return valid;
}
