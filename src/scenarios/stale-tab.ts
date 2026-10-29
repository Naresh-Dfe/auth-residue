import type { Config } from '../config/schema.js';
import type { ScenarioRuntime } from './runtime.js';
import { finding } from '../evidence/collector.js';
import type { Page } from 'playwright';
import { visibleMarker } from '../browser/navigation.js';
import { privateSelectors } from '../assertions/private-views.js';

export async function checkStaleTabs(
  runtime: ScenarioRuntime,
  staleTabs: { page: Page; route: Config['routes'][number] }[],
): Promise<void> {
  const { config } = runtime;

  for (const stale of staleTabs) {
    const retained = await visibleMarker(
      stale.page,
      privateSelectors(config, stale.route),
      config.accounts.a.privateMarker,
    );
    finding(runtime, {
      title: 'Already-rendered stale tab content',
      phase: 'stale-before-reload',
      route: stale.route.path,
      status: retained ? 'INCONCLUSIVE' : 'PASS',
      severity: 'low',
      expected: 'Observe rendered content separately from subsequent access.',
      actual: retained
        ? 'Previously rendered A marker remains; no new server access is established.'
        : 'A marker is no longer visible.',
      evidence: { markerMatched: retained },
      limitations: [
        'A static rendered page alone cannot prove session invalidation failed. Reload and GET authorization have separate findings.',
      ],
    });
    await stale.page.reload({ waitUntil: 'domcontentloaded' });
    if (stale.route.readySelector)
      await stale.page
        .locator(stale.route.readySelector)
        .waitFor({ state: 'visible' });
    const matched = await visibleMarker(
      stale.page,
      privateSelectors(config, stale.route),
      config.accounts.a.privateMarker,
    );
    finding(runtime, {
      title: 'Stale tab after reload',
      phase: 'stale-reload',
      route: stale.route.path,
      status: matched ? 'FAIL' : 'PASS',
      severity: 'medium',
      expected: 'A marker is absent after stale tab reload.',
      actual: matched
        ? 'A private marker remains visible after reload.'
        : 'A private marker is absent after reload.',
      evidence: { markerMatched: matched, positiveControl: true },
    });
  }
}
