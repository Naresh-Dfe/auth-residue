import type { Page } from 'playwright';
import type { Config } from '../config/schema.js';
import { authorizedURL } from './network.js';

export async function navigate(
  page: Page,
  path: string,
  config: Config,
  retryTransport = false,
): Promise<void> {
  const url = authorizedURL(path, config).href;
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.timeouts.navigation,
      });
      authorizedURL(page.url(), config);
      return;
    } catch (error) {
      if (
        !retryTransport ||
        attempt >= config.retry.navigation ||
        page.isClosed()
      )
        throw error;
    }
  }
}

export async function visibleMarker(
  page: Page,
  selectors: readonly string[],
  marker: string,
): Promise<boolean> {
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count();
    if (count > 1000) throw new Error('Selector is too broad');
    for (let index = 0; index < count; index++) {
      const element = matches.nth(index);
      if (
        (await element.isVisible()) &&
        (await element.innerText()).includes(marker)
      )
        return true;
    }
  }
  return false;
}

export async function waitForMarker(
  page: Page,
  selectors: readonly string[],
  marker: string,
  timeout: number,
): Promise<void> {
  await page.waitForFunction(
    ({ selectors, marker }) =>
      selectors.some((selector) =>
        Array.from(document.querySelectorAll<HTMLElement>(selector)).some(
          (element) => {
            const style = getComputedStyle(element);
            return (
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              element.getClientRects().length > 0 &&
              element.innerText.includes(marker)
            );
          },
        ),
      ),
    { selectors: [...selectors], marker },
    { timeout },
  );
}
