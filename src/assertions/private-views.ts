import type { Config } from '../config/schema.js';
import type { ScenarioRuntime } from '../scenarios/runtime.js';
import { finding } from '../evidence/collector.js';
import type { AccountId } from '../config/schema.js';
import { confirmIdentity } from '../auth/session.js';
import {
  navigate,
  visibleMarker,
  waitForMarker,
} from '../browser/navigation.js';

export function privateSelectors(
  config: Config,
  route: Config['routes'][number],
): string[] {
  return route.privateSelectors ?? config.privateSelectors;
}

export async function warmViews(
  runtime: ScenarioRuntime,
  account: AccountId,
): Promise<void> {
  const { config, page } = runtime;
  const definition = config.accounts[account];
  if (!definition) throw new Error('Missing identity definition');
  for (const route of config.routes) {
    await navigate(page, route.path, config);
    if (route.readySelector)
      await page.locator(route.readySelector).waitFor({ state: 'visible' });
    await confirmIdentity(page, config, account);
    await waitForMarker(
      page,
      privateSelectors(config, route),
      definition.privateMarker,
      config.timeouts.action,
    );
  }
}

export async function routeSnapshot(
  runtime: ScenarioRuntime,
): Promise<boolean[]> {
  const result: boolean[] = [];
  for (const route of runtime.config.routes) {
    await navigate(runtime.page, route.path, runtime.config);
    if (route.readySelector)
      await runtime.page
        .locator(route.readySelector)
        .waitFor({ state: 'visible' });
    result.push(
      await visibleMarker(
        runtime.page,
        privateSelectors(runtime.config, route),
        runtime.config.accounts.a.privateMarker,
      ),
    );
  }
  return result;
}

export async function checkRoutes(
  runtime: ScenarioRuntime,
  phase: string,
): Promise<void> {
  const observations = await routeSnapshot(runtime);
  observations.forEach((matched, index) => {
    const route = runtime.config.routes[index]!;
    finding(runtime, {
      title: 'Previous identity private content',
      phase,
      route: route.path,
      status: matched ? 'FAIL' : 'PASS',
      severity: runtime.id === 'logout-ui' ? 'medium' : 'high',
      expected:
        'Account A private marker is not visible in configured private selectors.',
      actual: matched
        ? 'Account A private marker was visible.'
        : 'Account A private marker was not visible in configured selectors.',
      evidence: {
        expectedIdentity: phase.includes('switch') ? 'B' : 'anonymous',
        observedMarkerIdentity: matched ? 'A' : 'none',
        markerMatched: matched,
        positiveControl: true,
      },
    });
  });
}
