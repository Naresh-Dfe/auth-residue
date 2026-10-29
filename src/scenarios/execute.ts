import type { Page } from 'playwright';
import type { Config } from '../config/schema.js';
import type { ScenarioRuntime } from './runtime.js';
import { confirmIdentity, login, logout } from '../auth/session.js';
import { navigate, waitForMarker } from '../browser/navigation.js';
import { probe } from '../browser/network.js';
import type { GetResponse } from '../browser/network.js';
import { inspectStorage } from '../browser/storage.js';
import { finding } from '../evidence/collector.js';
import {
  privateSelectors,
  warmViews,
  routeSnapshot,
  checkRoutes,
} from '../assertions/private-views.js';
import { positiveProbes, checkDenied } from '../assertions/protected-api.js';
import { compareStorage } from '../assertions/storage.js';
import { checkLogoutUI } from './logout-ui.js';
import { checkAccountSwitch } from './account-switch.js';
import { checkStaleTabs } from './stale-tab.js';

export async function executeScenario(runtime: ScenarioRuntime): Promise<void> {
  const { id, config, context, page, credentials } = runtime;
  runtime.setPhase('anonymous-baseline');
  await navigate(page, config.auth.loginPath, config, true);
  await page
    .locator(config.auth.anonymousSelector)
    .waitFor({ state: 'visible' });
  const anonymousRoutes =
    id === 'protected-routes' ? await routeSnapshot(runtime) : [];
  const anonymousProbes = new Map<string, GetResponse>();
  if (id === 'protected-api')
    for (const definition of config.probes)
      anonymousProbes.set(
        definition.path,
        await probe(context, config, definition, runtime.signal),
      );
  runtime.setPhase('login-a');
  await login(page, config, credentials, 'a');
  runtime.setPhase('private-positive-controls');
  if (id !== 'logout-session' && id !== 'protected-api')
    await warmViews(runtime, 'a');
  const apiScenario = [
    'logout-session',
    'protected-api',
    'account-switch',
    'stale-tab',
  ].includes(id);
  const validProbes = apiScenario ? await positiveProbes(runtime) : [];
  if (id === 'protected-routes')
    anonymousRoutes.forEach((matched, index) =>
      finding(runtime, {
        title: 'Anonymous private view access',
        phase: 'anonymous',
        route: config.routes[index]!.path,
        status: matched ? 'FAIL' : 'PASS',
        expected: 'Anonymous browser cannot see A private marker.',
        actual: matched
          ? 'A marker was visible anonymously.'
          : 'A marker was not visible anonymously.',
        evidence: { markerMatched: matched, positiveControl: true },
      }),
    );
  if (id === 'protected-api')
    for (const definition of validProbes)
      checkDenied(
        runtime,
        definition,
        anonymousProbes.get(definition.path)!,
        'anonymous',
      );
  runtime.setPhase('transition-preparation');
  const replayCookies = ['logout-session', 'protected-api'].includes(id)
    ? await context.cookies()
    : undefined;
  const storageBefore = ['storage-isolation', 'account-switch'].includes(id)
    ? await inspectStorage(page, config, config.accounts.a.privateMarker)
    : [];
  const staleTabs: { page: Page; route: Config['routes'][number] }[] = [];
  if (id === 'stale-tab') {
    for (const route of config.routes) {
      const tab = await context.newPage();
      await navigate(tab, route.path, config);
      if (route.readySelector)
        await tab.locator(route.readySelector).waitFor({ state: 'visible' });
      await confirmIdentity(tab, config, 'a');
      await waitForMarker(
        tab,
        privateSelectors(config, route),
        config.accounts.a.privateMarker,
        config.timeouts.action,
      );
      staleTabs.push({ page: tab, route });
    }
  }
  await navigate(page, config.auth.authenticatedPath, config);
  await confirmIdentity(page, config, 'a');
  runtime.setPhase('logout');
  const anonymousUI = await logout(page, config, 'a');
  if (!anonymousUI) {
    finding(runtime, {
      title: 'Logout transition unconfirmed',
      phase: 'logout',
      status: 'INCONCLUSIVE',
      expected:
        'Configured anonymous UI confirms completed logout before revocation or isolation checks.',
      actual:
        'Anonymous UI did not appear after the configured logout action. Session revocation and identity-switch assertions were not attributed to this unconfirmed transition.',
      evidence: { anonymousUI: false },
    });
    return;
  }
  runtime.setPhase('post-logout-assertions');
  if (['logout-ui', 'protected-routes'].includes(id))
    finding(runtime, {
      title: 'Logout anonymous UI confirmation',
      phase: 'logout',
      status: 'PASS',
      expected: 'Configured anonymous UI appears after logout.',
      actual: 'Anonymous UI appeared.',
      severity: 'low',
      evidence: { anonymousUI },
    });
  if (id === 'logout-ui') await checkLogoutUI(runtime);
  if (id === 'protected-routes') await checkRoutes(runtime, 'post-logout');
  if (['protected-api', 'stale-tab'].includes(id))
    for (const definition of validProbes)
      checkDenied(
        runtime,
        definition,
        await probe(context, config, definition, runtime.signal),
        'post-logout',
      );
  if (replayCookies) {
    runtime.setPhase('former-session-replay');
    const replay = await runtime.createContext();
    try {
      await replay.addCookies(replayCookies);
      for (const definition of validProbes)
        checkDenied(
          runtime,
          definition,
          await probe(replay, config, definition, runtime.signal),
          'former-session-replay',
        );
    } finally {
      await replay.close();
    }
  }
  if (['account-switch', 'protected-routes', 'protected-api'].includes(id))
    await checkAccountSwitch(runtime, validProbes, storageBefore);
  if (id === 'storage-isolation')
    await compareStorage(
      runtime,
      storageBefore,
      await inspectStorage(page, config, config.accounts.a.privateMarker),
      'post-logout',
    );
  if (id === 'stale-tab') await checkStaleTabs(runtime, staleTabs);
}
