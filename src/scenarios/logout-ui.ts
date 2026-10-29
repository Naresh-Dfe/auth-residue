import type { ScenarioRuntime } from './runtime.js';
import { visibleMarker } from '../browser/navigation.js';
import { finding } from '../evidence/collector.js';
import { checkRoutes } from '../assertions/private-views.js';

export async function checkLogoutUI(runtime: ScenarioRuntime): Promise<void> {
  const { page, config } = runtime;
  const selectors = [
    ...new Set([
      ...config.privateSelectors,
      ...config.routes.flatMap((route) => route.privateSelectors ?? []),
    ]),
  ];

  const exposed = await visibleMarker(
    page,
    selectors,
    config.accounts.a.privateMarker,
  );
  finding(runtime, {
    title: 'Private marker immediately after logout',
    phase: 'logout',
    status: exposed ? 'FAIL' : 'PASS',
    expected: 'A private marker is not visible after logout.',
    actual: exposed
      ? 'A private marker is still visible.'
      : 'A private marker is absent from configured selectors.',
    severity: 'medium',
    evidence: { markerMatched: exposed, positiveControl: true },
  });
  await checkRoutes(runtime, 'post-logout');
  await page.reload({ waitUntil: 'domcontentloaded' });
  const readySelector = config.routes.at(-1)?.readySelector;
  if (readySelector)
    await page.locator(readySelector).waitFor({ state: 'visible' });
  const reloaded = await visibleMarker(
    page,
    selectors,
    config.accounts.a.privateMarker,
  );
  finding(runtime, {
    title: 'Private content after reload',
    phase: 'reload',
    status: reloaded ? 'FAIL' : 'PASS',
    severity: 'medium',
    expected: 'Reload does not reveal A marker.',
    actual: reloaded
      ? 'A marker is visible after reload.'
      : 'A marker is absent after reload.',
    evidence: { markerMatched: reloaded },
  });
  for (const direction of ['back', 'forward'] as const) {
    const response =
      direction === 'back'
        ? await page.goBack({ waitUntil: 'domcontentloaded' })
        : await page.goForward({ waitUntil: 'domcontentloaded' });
    if (!response) {
      finding(runtime, {
        title: `History ${direction}`,
        phase: `history-${direction}`,
        status: 'NOT_TESTED',
        expected: 'No A private marker in restored history.',
        actual:
          'No document response was available for this history traversal; history cache coverage is incomplete.',
      });
      continue;
    }
    const matched = await visibleMarker(
      page,
      selectors,
      config.accounts.a.privateMarker,
    );
    finding(runtime, {
      title: `History ${direction}`,
      phase: `history-${direction}`,
      status: matched ? 'FAIL' : 'PASS',
      severity: 'medium',
      expected: 'No configured sensitive marker visible in restored history.',
      actual: matched
        ? 'Configured A private marker visible in restored page.'
        : 'No A marker visible in traversed page.',
      evidence: { markerMatched: matched },
      limitations: [
        'A visible configured private marker is a UI exposure finding; it does not establish continuing server authorization.',
      ],
    });
  }
}
