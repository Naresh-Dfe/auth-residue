import type { Config } from '../config/schema.js';
import type { ScenarioRuntime } from './runtime.js';
import { finding } from '../evidence/collector.js';
import type { Status } from '../core/results.js';
import type { StorageSummary } from '../browser/storage.js';
import { inspectStorage } from '../browser/storage.js';
import { confirmIdentity, login } from '../auth/session.js';
import {
  navigate,
  visibleMarker,
  waitForMarker,
} from '../browser/navigation.js';
import { probe } from '../browser/network.js';
import { privateSelectors } from '../assertions/private-views.js';
import { compareStorage } from '../assertions/storage.js';

export async function checkAccountSwitch(
  runtime: ScenarioRuntime,
  validProbes: Config['probes'],
  storageBefore: StorageSummary[],
): Promise<void> {
  const { id, page, config, context, credentials } = runtime;

  runtime.setPhase('login-b');
  await login(page, config, credentials, 'b');
  runtime.setPhase('account-isolation');
  if (id !== 'protected-api') {
    for (const route of config.routes) {
      await navigate(page, route.path, config);
      if (route.readySelector)
        await page.locator(route.readySelector).waitFor({ state: 'visible' });
      // Check exposure before B's data assertion: an A-only cache leak is still a confirmed failure.
      const markerA = await visibleMarker(
        page,
        privateSelectors(config, route),
        config.accounts.a.privateMarker,
      );
      let identityB = false;
      let markerB = false;
      try {
        await confirmIdentity(page, config, 'b');
        identityB = true;
        await waitForMarker(
          page,
          privateSelectors(config, route),
          config.accounts.b!.privateMarker,
          config.timeouts.action,
        );
        markerB = true;
      } catch {
        /* Missing B data is inconclusive unless an A marker was already observed. */
      }
      const observedA =
        markerA ||
        (await visibleMarker(
          page,
          privateSelectors(config, route),
          config.accounts.a.privateMarker,
        ));
      finding(runtime, {
        title: 'Private view account isolation',
        phase: 'switch-b',
        route: route.path,
        status: observedA
          ? 'FAIL'
          : identityB && markerB
            ? 'PASS'
            : 'INCONCLUSIVE',
        expected: 'B identity and B private marker without A private marker.',
        actual: observedA
          ? 'Account A private marker was visible after authenticating B in the same context.'
          : identityB && markerB
            ? 'B private marker was visible without A private marker.'
            : 'B private view could not be positively established.',
        evidence: {
          expectedIdentity: 'B',
          observedMarkerIdentity: observedA ? 'A' : markerB ? 'B' : 'unknown',
          markerAMatched: observedA,
          markerBMatched: markerB,
          identityBConfirmed: identityB,
          positiveControl: true,
        },
      });
    }
  }
  if (['account-switch', 'protected-api'].includes(id)) {
    for (const definition of validProbes) {
      const response = await probe(context, config, definition, runtime.signal);
      const markerA = response.body.includes(config.accounts.a.privateMarker);
      const markerB = response.body.includes(config.accounts.b!.privateMarker);
      const status: Status = markerA
        ? 'FAIL'
        : !response.truncated &&
            !response.redirected &&
            !response.encoded &&
            markerB &&
            response.status >= 200 &&
            response.status < 300
          ? 'PASS'
          : 'INCONCLUSIVE';
      finding(runtime, {
        title: 'GET response account isolation',
        phase: 'switch-b',
        route: definition.path,
        status,
        expected: 'B private marker is returned without A private marker.',
        actual: markerA
          ? 'A private marker was returned to B.'
          : markerB
            ? 'B marker was returned without A marker.'
            : 'B API identity could not be confirmed.',
        evidence: {
          expectedIdentity: 'B',
          observedMarkerIdentity: markerA ? 'A' : markerB ? 'B' : 'unknown',
          markerAMatched: markerA,
          markerBMatched: markerB,
          status: response.status,
          bodyTruncated: response.truncated,
          encoded: response.encoded,
        },
      });
    }
  }
  if (id === 'account-switch')
    await compareStorage(
      runtime,
      storageBefore,
      await inspectStorage(page, config, config.accounts.a.privateMarker),
      'switch',
    );
}
