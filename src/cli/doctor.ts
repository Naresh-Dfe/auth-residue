import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { resolveCredentials } from '../config/schema.js';
import type { Config } from '../config/schema.js';
import { restrictContext, verifyReachable } from '../browser/network.js';
import { navigate } from '../browser/navigation.js';
import { confirmIdentity, login, logout } from '../auth/session.js';
import { waitForMarker } from '../browser/navigation.js';
import { probe } from '../browser/network.js';
import { launchControlledBrowser } from '../browser/launcher.js';

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}
export async function doctor(config: Config): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const check = async (
    name: string,
    fn: () => Promise<void>,
    success: string,
    failure: string,
  ) => {
    try {
      await fn();
      checks.push({ name, ok: true, message: success });
    } catch {
      checks.push({ name, ok: false, message: failure });
    }
  };
  checks.push({
    name: 'Node.js',
    ok: Number(process.versions.node.split('.')[0]) >= 22,
    message: `Node ${process.versions.node}; use a supported LTS version (22 or 24).`,
  });
  checks.push({
    name: 'Configuration and authorization',
    ok: true,
    message:
      'Validated configuration and explicit target origin authorization.',
  });
  await check(
    'Environment',
    async () => {
      resolveCredentials(config);
    },
    'Required environment references are set. Values withheld.',
    'Set all configured account email/password environment variables.',
  );
  await check(
    'Output directory',
    async () => {
      const directory = resolve(config.reports.outputDir);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const file = join(directory, `.authresidue-write-check-${randomUUID()}`);
      try {
        await writeFile(file, '', { flag: 'wx', mode: 0o600 });
      } finally {
        await rm(file, { force: true });
      }
    },
    'Output directory is writable.',
    'Choose a writable output directory; on Windows check path permissions and file locks.',
  );
  await check(
    'Application',
    () => verifyReachable(config),
    'Configured login path is reachable.',
    'Start the application; verify the login path, scheme, port, and allowed origins.',
  );
  let available = false;
  await check(
    'Chromium',
    async () => {
      await access(chromium.executablePath());
      available = true;
    },
    'Playwright Chromium executable found.',
    'Install Chromium: npx playwright install chromium (Linux may also need npx playwright install-deps chromium).',
  );
  if (available && checks.every((entry) => entry.ok)) {
    await check(
      'Selectors and authentication',
      async () => {
        const controlled = await launchControlledBrowser(config);
        const { browser } = controlled;
        try {
          const context = await browser.newContext({ serviceWorkers: 'block' });
          context.setDefaultTimeout(config.timeouts.action);
          context.setDefaultNavigationTimeout(config.timeouts.navigation);
          await restrictContext(context, config);
          const page = await context.newPage();
          await navigate(page, config.auth.loginPath, config);
          await page
            .locator(config.auth.anonymousSelector)
            .waitFor({ state: 'visible' });
          await login(page, config, resolveCredentials(config), 'a');
          for (const route of config.routes) {
            await navigate(page, route.path, config);
            if (route.readySelector)
              await page
                .locator(route.readySelector)
                .waitFor({ state: 'visible' });
            await confirmIdentity(page, config, 'a');
            await waitForMarker(
              page,
              route.privateSelectors ?? config.privateSelectors,
              config.accounts.a.privateMarker,
              config.timeouts.action,
            );
          }
          for (const definition of config.probes) {
            const response = await probe(context, config, definition);
            if (
              response.truncated ||
              response.redirected ||
              response.encoded ||
              response.status < 200 ||
              response.status >= 300 ||
              !response.body.includes(config.accounts.a.privateMarker)
            )
              throw new Error('GET positive control unavailable');
          }
          await navigate(page, config.auth.authenticatedPath, config);
          await page
            .locator(config.auth.logoutSelector)
            .waitFor({ state: 'visible' });
          // A normal UI logout is permitted; doctor is not a security scan.
          if (!(await logout(page, config, 'a')))
            throw new Error('Anonymous logout UI unavailable');
        } finally {
          await controlled.close();
        }
      },
      'A authentication, private route/probe positive controls, and anonymous logout UI were exercised.',
      'Authentication/selector/browser check failed. Verify synthetic credentials, exact identity text, selectors, browser system dependencies, and timeouts. Raw diagnostics are withheld.',
    );
  }
  return checks;
}
