import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { Config } from '../config/schema.js';
import { SetupError } from '../config/schema.js';
import { startOriginProxy } from './origin-proxy.js';

export async function launchControlledBrowser(
  config: Config,
  headless = true,
): Promise<{ browser: Browser; close: () => Promise<void> }> {
  const guard = await startOriginProxy(config);
  let browser: Browser;
  // HTTP/1.1 avoids opaque HTTP/2 origin coalescing inside an allowed TLS tunnel.
  try {
    browser = await chromium.launch({
      headless,
      proxy: guard.settings,
      args: ['--disable-quic', '--disable-http2'],
    });
  } catch {
    await guard.close();
    throw new SetupError(
      'CHROMIUM',
      'Chromium could not start. Run npx playwright install chromium; on Linux install its system dependencies as documented by Playwright.',
    );
  }
  let closing: Promise<void> | undefined;
  return {
    browser,
    close: () =>
      (closing ??= (async () => {
        try {
          await browser.close();
        } finally {
          await guard.close();
        }
      })()),
  };
}
